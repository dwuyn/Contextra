import { TiptapTransformer } from "@hocuspocus/transformer";
import { generateHTML, generateJSON } from "@tiptap/html/server";
import * as Y from "yjs";
import { CHAPTER_COLLABORATION_FIELD, createChapterBaseExtensions } from "@/lib/tiptap/chapterEditorExtensions";

const chapterTransformerExtensions = createChapterBaseExtensions();
const EMPTY_CHAPTER_HTML = "<p></p>";

export function getChapterDocumentName(chapterId: string) {
  return `chapter:${chapterId}:body`;
}

export function parseChapterDocumentName(documentName: string) {
  const match = /^chapter:([^:]+):body$/.exec(documentName);
  if (!match) {
    throw new Error("Invalid collaboration document name");
  }

  return {
    chapterId: match[1],
  };
}

export function isAuthorizedDocument(documentName: string, chapterId: string) {
  return documentName === getChapterDocumentName(chapterId);
}

export function createChapterYDocFromHtml(html: string | null | undefined) {
  const normalizedHtml = html?.trim() ? html : EMPTY_CHAPTER_HTML;
  const json = generateJSON(normalizedHtml, chapterTransformerExtensions);
  return TiptapTransformer.toYdoc(json, CHAPTER_COLLABORATION_FIELD, chapterTransformerExtensions);
}

export function shouldUseStoredChapterState(params: {
  chapterUpdatedAt: Date | string;
  stateUpdatedAt: Date | string | null | undefined;
}) {
  const { chapterUpdatedAt, stateUpdatedAt } = params;
  if (!stateUpdatedAt) {
    return false;
  }

  return new Date(stateUpdatedAt).getTime() >= new Date(chapterUpdatedAt).getTime();
}

function getChapterJsonFromYDoc(document: Y.Doc) {
  return TiptapTransformer.fromYdoc(document, CHAPTER_COLLABORATION_FIELD);
}

export function getChapterHtmlFromYDoc(document: Y.Doc) {
  return generateHTML(getChapterJsonFromYDoc(document), chapterTransformerExtensions);
}

export function encodeChapterState(document: Y.Doc) {
  return Buffer.from(Y.encodeStateAsUpdate(document));
}

export function replaceChapterDocumentContent(document: Y.Doc, html: string) {
  const replacement = createChapterYDocFromHtml(html);
  const targetFragment = document.getXmlFragment(CHAPTER_COLLABORATION_FIELD);
  const replacementFragment = replacement.getXmlFragment(CHAPTER_COLLABORATION_FIELD);

  if (targetFragment.length > 0) {
    targetFragment.delete(0, targetFragment.length);
  }

  const nextNodes = replacementFragment.toArray().map((node) => node.clone());
  if (nextNodes.length > 0) {
    targetFragment.insert(0, nextNodes as never[]);
  }
}
