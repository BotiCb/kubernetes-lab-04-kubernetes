# Examples

Runnable examples for the `sapi.click` k3s cluster.

Everything here is written for the `dani` tenant namespace; change to your name.

```sh
kubectl apply -f <folder>/
```

## The examples

| folder / file | what it shows | host |
|---|---|---|
| [`1-nginx-example-pod/`](1-nginx-example-pod) | the smallest thing that works: a **bare `kind: Pod`** + Service + Ingress | `pod.dani.sapi.click` |
| [`2-nginx-example-deployment/`](2-nginx-example-deployment) | the same nginx owned by a **Deployment** (self-healing) | `deploy.dani.sapi.click` |
| [`3-nginx-example-replicaset/`](3-nginx-example-replicaset) | the same nginx owned by a **ReplicaSet** - the object a Deployment actually manages | `replicaset.dani.sapi.click` |
| [`bun-hono-example/`](bun-hono-example) | a tiny **Bun + Hono** app + `Dockerfile`, built multi-arch and pushed to a **private** registry | - (built & pushed) |
| [`3-protected-image-example/`](3-protected-image-example) | pulling that **private** image with an `imagePullSecret` | `protected.dani.sapi.click` |
| [`4-immich-example/`](4-immich-example) | a real stack: Immich (Postgres+VectorChord, Valkey, ML, server) on PVCs | `immich.dani.sapi.click` |

## Common conventions

* `namespace: dani` is set explicitly in every object. Change it.
* **DNS is automatic**: external-dns publishes an A record from each Ingress
  (a MutatingAdmissionPolicy injects the `external-dns.kubernetes.io/target`
  annotation in tenant namespaces).
* **Nodes are arm64**: any image you build must contain `linux/arm64`.
* Tenant namespaces enforce Pod Security `baseline` (and only audit/warn
  `restricted`), with a ResourceQuota (4 CPU / 8Gi requests, 8 CPU / 16Gi limits,
  20Gi storage) and a LimitRange.
