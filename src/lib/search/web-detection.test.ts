import { test } from "node:test";
import assert from "node:assert/strict";
import { extractResults, type WebDetectionBlock } from "./web-detection.ts";

/** Run with: npm test */

test("prefers the English best-guess label over another language", () => {
  const { guess } = extractResults({
    bestGuessLabels: [
      { label: "خیره شدن به افق", languageCode: "fa" },
      { label: "philadelphia eagles hat", languageCode: "en" },
    ],
  });
  assert.equal(guess, "philadelphia eagles hat");
});

test("falls back to the only label when none is English", () => {
  const { guess } = extractResults({
    bestGuessLabels: [{ label: "casquette", languageCode: "fr" }],
  });
  assert.equal(guess, "casquette");
});

test("guess is null when Vision returns no usable label", () => {
  assert.equal(extractResults({}).guess, null);
  assert.equal(extractResults(undefined).guess, null);
  assert.equal(
    extractResults({ bestGuessLabels: [{ languageCode: "en" }] }).guess,
    null,
  );
});

test("keeps only pages that have both a url and a title", () => {
  const { candidates } = extractResults({
    pagesWithMatchingImages: [
      { url: "https://shop.test/hat", pageTitle: "Eagles Hat" },
      { url: "https://shop.test/no-title" },
      { pageTitle: "No URL" },
    ],
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].url, "https://shop.test/hat");
});

test("collapses whitespace in page titles", () => {
  const { candidates } = extractResults({
    pagesWithMatchingImages: [
      { url: "https://shop.test/x", pageTitle: "  Eagles\n\t Fitted   Hat " },
    ],
  });
  assert.equal(candidates[0].title, "Eagles Fitted Hat");
});

test("prefers a page's full match over its partial match for the thumbnail", () => {
  const { candidates } = extractResults({
    pagesWithMatchingImages: [
      {
        url: "https://shop.test/x",
        pageTitle: "Hat",
        fullMatchingImages: [{ url: "https://img.test/full.jpg" }],
        partialMatchingImages: [{ url: "https://img.test/partial.jpg" }],
      },
    ],
  });
  assert.equal(candidates[0].imageUrl, "https://img.test/full.jpg");
});

test("pools all three image buckets, exact matches first", () => {
  const { similarImages } = extractResults({
    fullMatchingImages: [{ url: "https://img.test/full.jpg" }],
    partialMatchingImages: [{ url: "https://img.test/partial.jpg" }],
    visuallySimilarImages: [{ url: "https://img.test/similar.jpg" }],
  });
  assert.deepEqual(similarImages, [
    "https://img.test/full.jpg",
    "https://img.test/partial.jpg",
    "https://img.test/similar.jpg",
  ]);
});

test("drops non-https images, which the fetch route would refuse anyway", () => {
  const { similarImages } = extractResults({
    visuallySimilarImages: [
      { url: "http://img.test/insecure.jpg" },
      { url: "https://img.test/fine.jpg" },
      { url: undefined },
    ],
  });
  assert.deepEqual(similarImages, ["https://img.test/fine.jpg"]);
});

test("deduplicates a url appearing in more than one bucket", () => {
  const { similarImages } = extractResults({
    fullMatchingImages: [{ url: "https://img.test/same.jpg" }],
    partialMatchingImages: [{ url: "https://img.test/same.jpg" }],
    visuallySimilarImages: [{ url: "https://img.test/same.jpg" }],
  });
  assert.deepEqual(similarImages, ["https://img.test/same.jpg"]);
});

test("does not repeat a photo already shown against its page", () => {
  const { candidates, similarImages } = extractResults({
    pagesWithMatchingImages: [
      {
        url: "https://shop.test/hat",
        pageTitle: "Eagles Hat",
        fullMatchingImages: [{ url: "https://img.test/shown.jpg" }],
      },
    ],
    visuallySimilarImages: [
      { url: "https://img.test/shown.jpg" },
      { url: "https://img.test/new.jpg" },
    ],
  });
  assert.equal(candidates[0].imageUrl, "https://img.test/shown.jpg");
  assert.deepEqual(similarImages, ["https://img.test/new.jpg"]);
});

test("caps both lists", () => {
  const many = (n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) => ({ url: `https://img.test/${prefix}${i}.jpg` }));

  const { candidates, similarImages } = extractResults({
    pagesWithMatchingImages: Array.from({ length: 30 }, (_, i) => ({
      url: `https://shop.test/${i}`,
      pageTitle: `Item ${i}`,
    })),
    visuallySimilarImages: many(30, "s"),
  });

  assert.equal(candidates.length, 8);
  assert.equal(similarImages.length, 12);
});

test("survives an empty or absent detection block", () => {
  for (const input of [undefined, {} as WebDetectionBlock]) {
    const result = extractResults(input);
    assert.deepEqual(result, { guess: null, candidates: [], similarImages: [] });
  }
});
