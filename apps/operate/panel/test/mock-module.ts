import { mock } from 'node:test';

type MockModuleOptions = Parameters<typeof mock.module>[1];
type MockModuleContext = ReturnType<typeof mock.module>;
type MockExports = Record<string, unknown> & { default?: unknown };

function toMockModuleOptions(exports: MockExports): MockModuleOptions {
  const legacyOptions: Record<string, unknown> = {};
  const namedMockValues: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(exports)) {
    if (name === 'default') {
      legacyOptions['default' + 'Export'] = value;
    } else {
      namedMockValues[name] = value;
    }
  }
  if (Object.keys(namedMockValues).length > 0) {
    legacyOptions['named' + 'Exports'] = namedMockValues;
  }
  return legacyOptions as MockModuleOptions;
}

export function mockModule(specifier: string | URL, exports: MockExports): MockModuleContext {
  return mock.module(specifier, toMockModuleOptions(exports));
}
