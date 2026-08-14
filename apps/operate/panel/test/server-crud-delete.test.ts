/** Explicitly discovers server-access, deletion cleanup, and validation scenarios. */
import {
  registerServerDeleteAccessCases,
  registerServerDeleteAuthenticationCase,
  registerServerDeleteValidationCases,
  registerServerListAuthenticationCase,
} from './cases/server-crud-delete-access-cases';
import { registerServerDeleteCleanupCases } from './cases/server-crud-delete-cleanup-cases';

registerServerListAuthenticationCase();
registerServerDeleteAccessCases();
registerServerDeleteCleanupCases();
registerServerDeleteValidationCases();
registerServerDeleteAuthenticationCase();
