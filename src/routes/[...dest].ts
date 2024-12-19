import { getBodyBuffer } from "@/utils/body";
import { getAfterResponseHeaders, getBlacklistedHeaders, getProxyHeaders } from "@/utils/headers";
import type { EventHandlerRequest, H3Event } from "h3";

export default defineEventHandler(async event => {
	// handle cors, if applicable
	if (isPreflightRequest(event))
		return handleCors(event, {
			origin: (origin: string) => {
				return origin === "https://xpui.app.spotify.com";
			},
			methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
		});

	// parse destination URL
	const destination = getRouterParam(event, "dest");
	if (!destination) {
		return await sendJson({
			event,
			status: 200,
			data: {
				message: `Proxy is working as expected (v${useRuntimeConfig(event).version})`,
			},
		});
	}

	if (
		checkBlacklistedTarget(destination) ||
		!isValidURL(destination) ||
		isCorsOriginAllowed(event.headers.get("origin") ?? undefined, {
			origin: (origin: string) => {
				return origin !== "https://xpui.app.spotify.com";
			},
		})
	) {
		return await sendJson({
			event,
			status: 400,
			data: {
				error: "Invalid target",
			},
		});
	}

	// read body
	const body = await getBodyBuffer(event);

	// proxy
	try {
		console.log(destination, event);
		await specificProxyRequest(event, destination, {
			blacklistedHeaders: getBlacklistedHeaders(),
			fetchOptions: {
				redirect: "follow",
				headers: getProxyHeaders(event.headers),
				body,
			},
			onResponse(outputEvent: H3Event<EventHandlerRequest>, response: { headers: Headers; url: string }) {
				const headers = getAfterResponseHeaders(response.headers, response.url);
				setResponseHeaders(outputEvent, headers);
			},
		});
	} catch (e) {
		console.log("Error fetching", e);
		throw e;
	}
});
