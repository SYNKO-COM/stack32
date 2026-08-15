# Pipedream Connect — executing actions (Stack32 digest)

Source: [Executing Actions](https://pipedream.com/docs/connect/components/actions),
[Run action](https://pipedream.com/docs/connect/api-reference/run-action),
[Reload action props](https://pipedream.com/docs/connect/api-reference/reload-action-props).

## Checklist

1. **Retrieve** component → read `configurable_props`.
2. Note props with `remoteOptions: true` and `reloadProps: true`.
3. Inject auth as `{ [authPropName]: { authProvisionId } }` — auth prop name from definition (`googleSheets`, not `google_sheets`).
4. **Configure** remote options in order via `POST .../components/configure` (or actions equivalent), always including prior `configured_props`.
5. If any prop has `reloadProps`, call **reload** (`POST .../actions/props`) and store `dynamicProps.id` (`dyp_…`).
6. **Run** with full `configured_props` + `dynamic_props_id` when required; optional `stash_id` for File Stash.

## Errors (`attribution.origin`)

| Origin | Meaning | Retry? |
|--------|---------|--------|
| `component_code` | Bad props / component logic before network | Fix inputs |
| `upstream_api` | 3rd-party 4xx/5xx | 5xx maybe; 4xx fix request |
| `network_io` | DNS/timeout | Often yes |
| `response_parsing` | 2xx but parse fail | No |

## Stack32 mapping

- `PipedreamClient.reload_props` / `run_action(..., dynamic_props_id=)`
- Provider auto-defaults Canva `designType`/`name` then reloads
- Google Calendar native tools map to `googleCalendar` + `eventStartDate`/`eventEndDate`
