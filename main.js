// The main server code.
const { createServer } = require("http");

const methods = Object.create(null);

createServer((request, response) => {
	let handler = methods[request.method] || notAllowed;
	handler(request)
		.catch(error => { 
			if (error.status != null) return error;
			return { body: String(error), status: 500 };
		})
		.then(({body, status = 200, type = "text/plain" }) => {
			response.writeHead(status, {"Content-Type": type });
			if (body && body.pipe) body.pipe(response);
			else response.end(body);
		});
}).listen(8000);
console.log("File server now listening on port 8000.");

async function notAllowed(request){ return { status: 405, body: `Method ${request.method} not allowed.` }; }

// Handles GET requests.
const { parse } = require("url");
const { resolve, sep } = require("path");

const baseDirectory = process.cwd();

function urlPath(url) {
	let { pathname } = parse(url);
	let path = resolve(decodeURIComponent(pathname).slice(1)); // Removes the leading forward slash, and then figures out which file it is trying to use.
	if (path != baseDirectory && !path.startsWith(baseDirectory + sep)) // If the requested file is not in the expected directory, reject it.
		throw { status: 403, body: "Forbidden" };
	return path;
}

const { createReadStream } = require("fs");
const { stat, readdir } = require("fs").promises;
const mime = require("mime");

methods.GET = async function(request) {
	let path = urlPath(request.url);
	let stats;
	try {
		stats = await stat(path);
	} catch(error) {
		if (error.code != "ENOENT") throw error;
		else return { status: 404, body: "File not found" };
	}
	if (stats.isDirectory()) return { body: (await readdir(path)).join("\n") };
	else                     return { body: createReadStream(path), type: mime.getType(path) };
};

// Handles DELETE requests for removing files and directories.
const { rmdir, unlink } = require("fs").promises;

methods.DELETE = async function(request) {
	let path = urlPath(request.url);
	let stats;
	try {
		stats = await stat(path);
	} catch(error) {
		if (error.code != "ENOENT") throw error;
		else return { status: 204 };
	}
	if (stats.isDirectory()) await rmdir(path);
	else await unlink(path);
	return { status: 204 };
}

// Handles PUT requests for uploading files.
const { createWriteStream } = require("fs");

function pipeStream(from, to) {
	return new Promise((resolve, reject) => {
		from.on("error", reject);
		to.on("error", reject);
		to.on("finish", resolve);
		from.pipe(to);
	});
}

methods.PUT = async function(request) {
	let path = urlPath(request.url);
	await pipeStream(request, createWriteStream(path));
	return { status: 204 };
}

// Handles MKCOL requests for making directories.
// MKCOL isn't a common method, but it is used to make collections.
const { mkdir } = require("fs").promises;
methods.MKCOL = async function(request) {
	let path = urlPath(request.url);
	await mkdir(path);
	return { status: 204 };
}