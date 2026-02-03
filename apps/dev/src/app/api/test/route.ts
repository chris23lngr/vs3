export const GET = (req: Request) => {
	console.log("GET /api/test", req);
	return new Response("Hello, world!");
};
