# Tests

These scripts test different parts of the Signtral CMS system. Run them individually with `node tests/<filename>`.

> **Note:** Most tests require a running MySQL database and valid `.env` configuration.

| File | Purpose |
|---|---|
| `test_db.js` | Database connection and schema validation |
| `test_db_alter.js` | Database migration / ALTER TABLE tests |
| `test_cms_connection.js` | Xibo CMS API connectivity and auth test |
| `test_e2e_pipeline.js` | Full end-to-end upload → schedule pipeline test |
| `test-pipeline-v2.js` | Pipeline v2 test (full slot-based flow) |
| `test_sync.js` | Xibo ↔ local DB sync functionality test |
| `test_users.js` | User management and authentication test |
| `test_layout.js` | Layout creation and rendering test |
| `test_grammar.js` | SQL grammar and query validation test |
| `test_pop.js` | Proof of Play (POP) display stats test |
| `test_region2.js` | Region management test |
| `test_region_layout.js` | Region layout assignment test |
| `test_resol_layout.js` | Resolution-based layout test |
| `test_system_integration.js` | Full system integration test |
| `test_add_partner.js` | Partner creation and provisioning test |

## Running Tests

```bash
# Single test
node tests/test_db.js

# Database connection
node tests/test_cms_connection.js

# Full pipeline
node tests/test_e2e_pipeline.js
```
