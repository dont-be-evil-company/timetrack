# timetrack

Simple desktop 🖥️ application to track your time ⏰ spent on different projects 🎉.

## Screenshots

### Overview

![Overview](assets/screenshots/overview.webp)

## Configuration

By default, there is no configuration file.
The application will NOT create one!

If you want to change the default configuration,
you have to create the configuration file yourself.

The configuration file should be located at:

- Linux: `~/.config/timetrack/config.yaml`.
- Mac: `~/Library/Application Support/timetrack/config.yaml`.
- Windows: `%APPDATA%\timetrack\config.yaml`.

> [!NOTE]
> Example configuration file for timetrack:

```yaml
# yaml-language-server: $schema=https://timetrack.mwco.app/config.schema.json
---
databases:
  - marco: /home/marco/Desktop/timetrack.db
  - work: /home/marco/Desktop/timetrack-work.db
```

If no configuration file is present, the default database location is:

- Linux: `~/.local/share/timetrack/timetrack.db`
- Mac: `~/Library/Application Support/timetrack/timetrack.db`
- Windows: `%LOCALAPPDATA%\timetrack\timetrack.db`

## Tempo (optional)

Time entries can be pushed to [Tempo](https://www.tempo.io/) for specific companies.
Sync is manual and one-way (timetrack → Tempo).
`config.yaml` stays commit-safe;
tokens live in a machine-local `sync.yaml` next to the default database.

| File          | Location (Linux)            | Role                                                                |
| ------------- | --------------------------- | ------------------------------------------------------------------- |
| `config.yaml` | `~/.config/timetrack/`      | Portable settings (`databases` only). Safe to version.              |
| `sync.yaml`   | `~/.local/share/timetrack/` | Tempo/Jira connections and secrets. Not for git. Prefer mode `600`. |

Other OS paths for `sync.yaml`:

- macOS: `~/Library/Application Support/timetrack/sync.yaml`
- Windows: `%LOCALAPPDATA%\timetrack\sync.yaml`

The app does not create `sync.yaml`. If the file is missing, Tempo stays disabled.

### Creating tokens (Cloud)

Cloud sync needs **two** tokens: a Tempo API token to write worklogs,
and a Jira API token to resolve issue keys (`PROJ-42` → numeric id) and
your Atlassian account id.

#### Tempo API token (`tempoToken`)

Tempo does not use your Jira API token.
Create a Tempo **API Integration** token:

1. Open Tempo in Jira (Tempo sidebar).
2. Go to **Settings → Data Access → API Integration**.
3. Click **New Token**.
4. Name it (for example `timetrack`), set an expiry (default is 30 days; you can choose longer).
5. Under access scope, either choose **full access**,
   or custom access with **Worklogs -> Manage** (needed to create and update worklogs).
   View-only is not enough.
6. Confirm, then **copy the token immediately**.
   Tempo shows it only once.
   If you lose it, regenerate the token (that invalidates the old one).

Paste that value into `tempoToken`. Official guide: [Using REST API integrations](https://help.tempo.io/timesheets/latest/using-rest-api-integrations).

#### Jira API token (`jiraEmail` + `jiraApiToken`)

1. Sign in at [Atlassian API tokens](https://id.atlassian.com/manage-profile/security/api-tokens).
2. Click **Create API token** (not “Create API token with scopes”).
3. Name it (for example `timetrack`) and set an expiry.
4. Copy the token immediately. Atlassian will not show it again.
5. Put your Atlassian account **email** in `jiraEmail` and the token in `jiraApiToken`.

Use an **unscoped** token.
Scoped tokens only work against `https://api.atlassian.com/ex/jira/{cloudId}/...`,
which this integration does not use.

Official guide: [Manage API tokens for your Atlassian account](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/).

Your Jira user must be allowed to log time on the issues you sync.

### Creating tokens (Data Center)

Data Center uses one credential pair for both Jira and Tempo (`jiraUsername` + `jiraToken`).
Prefer a **Personal Access Token** over your password:

1. In Jira Data Center, open your profile and go to **Personal Access Tokens**.
2. Create a token named `timetrack` with an expiry.
3. Copy it once, then put your Jira username in `jiraUsername` and the PAT in `jiraToken`.

The account needs permission to view issues and log work (Tempo Timesheets).
If PATs are disabled on your instance, `jiraToken` can be the account password instead.

### `sync.yaml` example

```yaml
# ~/.local/share/timetrack/sync.yaml  - not for git
tempo:
  connections:
    - name: acme
      edition: cloud
      jiraBaseUrl: https://acme.atlassian.net
      tempoToken: TEMPO_CLOUD_TOKEN
      jiraEmail: you@example.com
      jiraApiToken: ATLASSIAN_API_TOKEN
    - name: onprem
      edition: datacenter
      jiraBaseUrl: https://jira.example.com
      jiraUsername: you
      jiraToken: PAT_OR_PASSWORD
```

Then, in the app:

1. Edit a company and choose a Tempo connection.
2. Set an optional issue key on a task definition (copied onto new timers) or on each time entry.
3. Click **Sync to Tempo** on that company.

Completed, non-zero entries with an issue key are created or updated as Tempo worklogs.
Running timers, zero-duration rows, and entries without an issue key are skipped.
Remote worklogs are not deleted if a local entry is removed.

## Development

Checkout the [development guide](docs/development.md) for more information.
