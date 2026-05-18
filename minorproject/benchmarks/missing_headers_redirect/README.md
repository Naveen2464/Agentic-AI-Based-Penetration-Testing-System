# Missing Headers + Open Redirect Benchmark

Intentionally vulnerable local benchmark for the vuln-scanner project.

## Run

```sh
npm start
```

Default URL:

```text
http://localhost:4001
```

## Vulnerabilities

- Missing security headers on HTML responses.
- Open redirect at `/go?next=<url>`.

Example scan targets:

```text
http://localhost:4001/
http://localhost:4001/go?next=https://evil.example.test
```
