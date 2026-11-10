// Usa el compilador del proyecto también en distribuciones Node sin strip-types.
import ts from 'typescript';
import { readFile, access } from 'node:fs/promises';
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && context.parentURL) {
    for (const extension of ['.ts', '.tsx']) {
      const url = new URL(specifier + extension, context.parentURL);
      try { await access(url); return { url: url.href, shortCircuit: true }; } catch {}
    }
  }
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (/\.tsx?$/.test(url)) {
    const source = await readFile(new URL(url), 'utf8');
    return { format: 'module', shortCircuit: true, source: ts.transpileModule(source, {
      fileName: new URL(url).pathname,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText };
  }
  return next(url, context);
}
