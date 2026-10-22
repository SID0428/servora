# ServSure Workspace & Coding Guidelines

## Documentation Maintenance (Mandatory)
Whenever any modifications are made to the platform (backend routes, database models, frontend scripts, HTML portals, or configurations):
1. **Always Update `documentation.txt`**:
   - Keep the architecture, API endpoint reference, database models, and frontend breakdown synchronized with the latest changes.
   - Update the "Last Updated" timestamp and relevant sections.
2. **Ensure Verification Before Completing Tasks**:
   - Run `python3 -m py_compile` on modified Python files.
   - Run `node --check` on modified JavaScript files.
3. **Maintain Dual Compatibility & Access Controls**:
   - Always preserve `validate_user_active_and_hierarchy` on authenticated endpoints.
   - Maintain backward-compatible storage keys (`servsure_*` and `servora_*`).
