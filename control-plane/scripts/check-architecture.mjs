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

const SQL_STATEMENT_METHODS = new Set(['prepare', 'transaction', 'pragma']);

// SQL text and transactions belong only in a feature repository.ts (or *Repository.ts) module,
// or in src/infrastructure/sqlite. Every other file under src is a violation.
function isAllowedSqlLocation(file, sourceRoot) {
  if (isWithin(file, path.join(sourceRoot, 'infrastructure', 'sqlite'))) return true;
  const base = path.basename(file);
  return base === 'repository.ts' || base.endsWith('Repository.ts');
}

function sqlStatementViolations(file, relativeFile, source, sourceRoot) {
  if (isAllowedSqlLocation(file, sourceRoot)) return [];
  const violations = [];
  const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.name)
    ) {
      const methodName = node.expression.name.text;
      const receiver = node.expression.expression;
      const isBareSqlCall = SQL_STATEMENT_METHODS.has(methodName);
      const isDatabaseExecCall =
        methodName === 'exec' &&
        ts.isIdentifier(receiver) &&
        (receiver.text === 'db' || receiver.text === 'database');
      if (isBareSqlCall || isDatabaseExecCall) {
        violations.push(
          `${relativeFile}: SQL statements belong only in a repository.ts module or src/infrastructure/sqlite (.${methodName}(...))`
        );
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(syntax);
  return violations;
}

function targetAreaFor(file, specifier, sourceRoot) {
  const resolved = path.resolve(path.dirname(file), specifier);
  if (!isWithin(resolved, sourceRoot)) return undefined;
  return path.relative(sourceRoot, resolved).split(path.sep)[0];
}

function integrationNameFor(relativeParts) {
  return relativeParts[0] === 'integrations' ? relativeParts[1] : undefined;
}

// A file outside src/integrations/<name>/ may reach that integration only through its
// src/integrations/<name> entry point (index.ts), never a deeper path.
function checkIntegrationEntryPoint(relativeFile, specifier, resolved, sourceRoot, violations) {
  if (!isWithin(resolved, sourceRoot)) return;
  const targetParts = path.relative(sourceRoot, resolved).split(path.sep);
  const targetIntegration = integrationNameFor(targetParts);
  if (!targetIntegration) return;
  if (integrationNameFor(relativeFile.split(path.sep)) === targetIntegration) return;

  const remainder = targetParts.slice(2);
  const isEntryPoint =
    remainder.length === 0 ||
    (remainder.length === 1 && /^index(\.[cm]?[jt]sx?)?$/.test(remainder[0]));
  if (isEntryPoint) return;

  violations.push(
    `${relativeFile}: must import the ${targetIntegration} integration only through src/integrations/${targetIntegration} (${specifier})`
  );
}

// src/integrations must not reach SQLite persistence directly; that lives in src/infrastructure/sqlite.
function isForbiddenSqlitePersistence(file, specifier, sourceRoot) {
  if (specifier === 'better-sqlite3') return true;
  if (!specifier.startsWith('.')) return false;
  const resolved = path.resolve(path.dirname(file), specifier);
  if (!isWithin(resolved, sourceRoot)) return false;
  const parts = path.relative(sourceRoot, resolved).split(path.sep);
  return parts[0] === 'infrastructure' && parts[1] === 'sqlite';
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
    const isGuardedArea = guardedAreas.has(sourceArea);

    const source = await readFile(file, 'utf8');
    violations.push(...sqlStatementViolations(file, relativeFile, source, sourceRoot));
    for (const specifier of moduleSpecifiers(file, source)) {
      if (
        sourceArea === 'integrations' &&
        isForbiddenSqlitePersistence(file, specifier, sourceRoot)
      ) {
        violations.push(
          `${relativeFile}: integrations must not import SQLite persistence directly (${specifier})`
        );
      }

      if (!specifier.startsWith('.')) continue;
      const resolved = path.resolve(path.dirname(file), specifier);
      checkIntegrationEntryPoint(relativeFile, specifier, resolved, sourceRoot, violations);

      if (!isGuardedArea) continue;
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
