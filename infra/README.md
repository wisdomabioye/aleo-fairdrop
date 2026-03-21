# infra/

Deployment and operations configuration.

| Directory | Contents |
|---|---|
| `docker/` | `docker-compose.yml` for local development (postgres + indexer + api + credential-signer) |
| `k8s/` | Kubernetes manifests for production (not required for early-stage deploys) |
| `terraform/` | Cloud infra definitions (VPC, managed postgres, secrets) |
| `monitoring/` | Prometheus/Grafana dashboards and alert rules |

For local dev, only Docker Compose is needed:

```bash
docker compose -f infra/docker/docker-compose.yml up
```

Production deployments use Fly.io (services) and Neon (managed postgres) until the scale warrants K8s.
