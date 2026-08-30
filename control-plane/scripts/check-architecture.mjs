import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const guardedAreas = new Set(['features', 'infrastructure', 'integrations', 'shared']);
const forbiddenTargets = {
  features: new Set(['app']),
  infrastructure: new Set(['app', 'features', 'integrations']),
  integrations: new Set(['app', 'features']),
  shared: new Set(['app', 'features', 'infrastructure', 'integrations']),
};

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(target);
      return entry.isFile() && entry.name.endsWith('.ts') ? [target] : [];
    })
  );
  return nested.flat();
}

function moduleSpecifiers(file, source) {
  const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const specifiers = [];

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      specifiers.push(node.moduleReference.expression.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }

  visit(syntax);
  return specifiers;
}

function isWithin(candidate, directory) {
  const relative = path.relative(directory, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function targetAreaFor(file, specifier, sourceRoot) {
  const resolved = path.resolve(path.dirname(file), specifier);
  if (!isWithin(resolved, sourceRoot)) return undefined;
  return path.relative(sourceRoot, resolved).split(path.sep)[0];
}

export async function collectArchitectureViolations({
  sourceRoot = path.resolve('src'),
  webRoot = path.resolve('web/client'),
} = {}) {
  const violations = [];
  const featureDependencies = new Map();

  for (const file of await sourceFiles(sourceRoot)) {
    const relativeFile = path.relative(sourceRoot, file);
    const sourceArea = relativeFile.split(path.sep)[0];
    if (!guardedAreas.has(sourceArea)) continue;

    const source = await readFile(file, 'utf8');
    for (const specifier of moduleSpecifiers(file, source)) {
      if (!specifier.startsWith('.')) continue;
      const resolved = path.resolve(path.dirname(file), specifier);
      const targetArea = targetAreaFor(file, specifier, sourceRoot);
      if (!targetArea) continue;

      if (/^main(?:\.[^/]*)?$/.test(targetArea) || forbiddenTargets[sourceArea].has(targetArea)) {
        violations.push(
          `${relativeFile}: ${sourceArea} must not import ${targetArea} (${specifier})`
        );
      }

      if (sourceArea === 'features' && targetArea === 'features') {
        const sourceFeature = relativeFile.split(path.sep)[1];
        const targetFeature = path.relative(sourceRoot, resolved).split(path.sep)[1];
        if (sourceFeature && targetFeature && sourceFeature !== targetFeature) {
          const dependencies = featureDependencies.get(sourceFeature) ?? new Set();
          dependencies.add(targetFeature);
          featureDependencies.set(sourceFeature, dependencies);
        }
      }
    }
  }

  const sharedRoot = path.join(sourceRoot, 'shared');
  for (const file of await sourceFiles(webRoot)) {
    const source = await readFile(file, 'utf8');
    for (const specifier of moduleSpecifiers(file, source)) {
      if (!specifier.startsWith('.')) continue;
      const resolved = path.resolve(path.dirname(file), specifier);
      if (!isWithin(resolved, webRoot) && !isWithin(resolved, sharedRoot)) {
        violations.push(
          `${path.relative(webRoot, file)}: browser code may import only browser code or src/shared (${specifier})`
        );
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visitFeature(feature, pathToFeature = []) {
    if (visiting.has(feature)) {
      const cycleStart = pathToFeature.indexOf(feature);
      violations.push(
        `feature dependency cycle: ${[...pathToFeature.slice(cycleStart), feature].join(' -> ')}`
      );
      return;
    }
    if (visited.has(feature)) return;
    visiting.add(feature);
    for (const dependency of featureDependencies.get(feature) ?? []) {
      visitFeature(dependency, [...pathToFeature, feature]);
    }
    visiting.delete(feature);
    visited.add(feature);
  }

  for (const feature of featureDependencies.keys()) visitFeature(feature);
  return violations;
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const violations = await collectArchitectureViolations();
  if (violations.length > 0) {
    process.stderr.write(`${violations.join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('Architecture dependency rules passed.\n');
  }
}
