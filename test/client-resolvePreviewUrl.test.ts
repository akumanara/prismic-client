import test from "ava";
import * as mswNode from "msw/node";
import { Headers } from "node-fetch";
import AbortController from "abort-controller";

import { createDocument } from "./__testutils__/createDocument";
import { createMockQueryHandler } from "./__testutils__/createMockQueryHandler";
import { createMockRepositoryHandler } from "./__testutils__/createMockRepositoryHandler";
import { createQueryResponse } from "./__testutils__/createQueryResponse";
import { createTestClient } from "./__testutils__/createClient";
import { createRepositoryResponse } from "./__testutils__/createRepositoryResponse";

const server = mswNode.setupServer();
test.before(() => server.listen({ onUnhandledRequest: "error" }));
test.after(() => server.close());

// Tests in this file must be serial because some test mutate globalThis which
// could affect others.

test.serial("resolves a preview url in the browser", async (t) => {
	const document = createDocument();
	const queryResponse = createQueryResponse([document]);

	const documentId = document.id;
	const previewToken = "previewToken";

	globalThis.location = {
		...globalThis.location,
		search: `?documentId=${documentId}&token=${previewToken}`,
	};

	server.use(
		createMockRepositoryHandler(t),
		createMockQueryHandler(t, [queryResponse], undefined, {
			ref: previewToken,
			q: `[[at(document.id, "${documentId}")]]`,
			lang: "*",
		}),
	);

	const client = createTestClient(t);
	const res = await client.resolvePreviewURL({
		linkResolver: (document) => `/${document.uid}`,
		defaultURL: "defaultURL",
	});

	t.is(res, `/${document.uid}`);

	// @ts-expect-error - Need to reset back to Node.js's default globalThis without `location`
	globalThis.location = undefined;
});

test.serial("resolves a preview url using a server req object", async (t) => {
	const document = createDocument();
	const queryResponse = createQueryResponse([document]);

	const documentId = document.id;
	const previewToken = "previewToken";
	const req = { query: { documentId, token: previewToken } };

	server.use(
		createMockRepositoryHandler(t),
		createMockQueryHandler(t, [queryResponse], undefined, {
			ref: previewToken,
			q: `[[at(document.id, "${documentId}")]]`,
			lang: "*",
		}),
	);

	const client = createTestClient(t);
	client.enableAutoPreviewsFromReq(req);
	const res = await client.resolvePreviewURL({
		linkResolver: (document) => `/${document.uid}`,
		defaultURL: "defaultURL",
	});

	t.is(res, `/${document.uid}`);
});

test.serial(
	"resolves a preview url using a Web API-based server req object",
	async (t) => {
		const document = createDocument();
		const queryResponse = createQueryResponse([document]);

		const documentId = document.id;
		const previewToken = "previewToken";

		const headers = new Headers();
		const url = new URL("https://example.com");
		url.searchParams.set("documentId", documentId);
		url.searchParams.set("token", previewToken);
		const req = {
			headers,
			url: url.toString(),
		};

		server.use(
			createMockRepositoryHandler(t),
			createMockQueryHandler(t, [queryResponse], undefined, {
				ref: previewToken,
				q: `[[at(document.id, "${documentId}")]]`,
				lang: "*",
			}),
		);

		const client = createTestClient(t);
		client.enableAutoPreviewsFromReq(req);
		const res = await client.resolvePreviewURL({
			linkResolver: (document) => `/${document.uid}`,
			defaultURL: "defaultURL",
		});

		t.is(res, `/${document.uid}`);
	},
);

test.serial(
	"allows providing an explicit documentId and previewToken",
	async (t) => {
		const document = createDocument();
		const queryResponse = createQueryResponse([document]);

		const documentID = document.id;
		const previewToken = "previewToken";
		const req = {
			query: {
				documentId: "this will be unused",
				token: "this will be unused",
			},
		};

		server.use(
			createMockRepositoryHandler(t),
			createMockQueryHandler(t, [queryResponse], undefined, {
				ref: previewToken,
				q: `[[at(document.id, "${documentID}")]]`,
				lang: "*",
			}),
		);

		const client = createTestClient(t);
		client.enableAutoPreviewsFromReq(req);
		const res = await client.resolvePreviewURL({
			linkResolver: (document) => `/${document.uid}`,
			defaultURL: "defaultURL",
			documentID,
			previewToken,
		});

		t.is(res, `/${document.uid}`);
	},
);

test.serial(
	"returns defaultURL if current url does not contain preview params in browser",
	async (t) => {
		const defaultURL = "defaultURL";

		// Set a global Location object without the parameters we need for automatic
		// preview support.
		globalThis.location = { ...globalThis.location, search: "" };

		const client = createTestClient(t);
		const res = await client.resolvePreviewURL({
			linkResolver: (document) => `/${document.uid}`,
			defaultURL,
		});

		t.is(res, defaultURL);

		// @ts-expect-error - Need to reset back to Node.js's default globalThis without `location`
		globalThis.location = undefined;
	},
);

test.serial(
	"returns defaultURL if req does not contain preview params in server req object",
	async (t) => {
		const defaultURL = "defaultURL";
		const req = {};

		const client = createTestClient(t);
		client.enableAutoPreviewsFromReq(req);
		const res = await client.resolvePreviewURL({
			linkResolver: (document) => `/${document.uid}`,
			defaultURL,
		});

		t.is(res, defaultURL);
	},
);

test.serial(
	"returns defaultURL if no preview context is available",
	async (t) => {
		const defaultURL = "defaultURL";

		const client = createTestClient(t);
		const res = await client.resolvePreviewURL({
			linkResolver: (document) => `/${document.uid}`,
			defaultURL,
		});

		t.is(res, defaultURL);
	},
);

test.serial("returns defaultURL if resolved URL is not a string", async (t) => {
	const defaultURL = "defaultURL";
	const document = createDocument();
	const queryResponse = createQueryResponse([document]);

	const documentID = document.id;
	const previewToken = "previewToken";

	server.use(
		createMockRepositoryHandler(t),
		createMockQueryHandler(t, [queryResponse], undefined, {
			ref: previewToken,
			q: `[[at(document.id, "${documentID}")]]`,
			lang: "*",
		}),
	);

	const client = createTestClient(t);
	const res = await client.resolvePreviewURL({
		linkResolver: () => null,
		defaultURL,
		documentID,
		previewToken,
	});

	t.is(res, defaultURL);
});

test("is abortable with an AbortController", async (t) => {
	const repositoryResponse = createRepositoryResponse();
	const document = createDocument();

	const documentID = document.id;
	const previewToken = "previewToken";

	server.use(createMockRepositoryHandler(t, repositoryResponse));

	const client = createTestClient(t);

	await t.throwsAsync(
		async () => {
			const controller = new AbortController();
			controller.abort();

			await client.resolvePreviewURL({
				signal: controller.signal,
				defaultURL: "/",
				documentID,
				previewToken,
			});
		},
		{ name: "AbortError" },
	);
});
