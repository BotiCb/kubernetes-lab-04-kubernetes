# 4-immich-example - Immich on `immich.dani.sapi.click`

A small, self-contained Immich deployment for the `dani` tenant namespace,
translated from the official
[`docker-compose.yml`](https://github.com/immich-app/immich/releases/latest/download/docker-compose.yml)
(release channel) into plain Kubernetes manifests. It uses this cluster's
conventions: **Traefik Ingress** + an automatic per-host `*.sapi.click`
certificate (no per-Ingress annotations), **local-path PersistentVolumeClaims**
for state,
and a **Deployment** for PostgreSQL.

```
                 Internet
                    │  HTTPS (Traefik, per-host cert)
                    ▼
   Immich Ingress ── immich.dani.sapi.click ──► Service immich-server:2283
                                                     │
                       ┌─────────────────────────────┼──────────────────────────┐
                       ▼                             ▼                          ▼
              Service postgres:5432        Service redis:6379      Service immich-machine-learning:3003
              (PVC 5Gi, VectorChord)       (emptyDir, job queue)    (emptyDir model cache)
                       ▲
                       └── PVC immich-library 12Gi ──► mounted at immich-server:/data
```

## Apply

You only need the tenant kubeconfig (it already defaults to the `dani`
namespace and owns everything below):

```sh
export KUBECONFIG=/k8s/20261016-k8s/kubeconfigs/dani.kubeconfig
kubectl apply -f /k8s/20261016-k8s/examples/4-immich-example/
```

`kubectl apply -f <dir>` reads every `.yaml` in the directory in filename
order, so the Secret and PVCs exist before the Pods that use them.

> **Before you expose this to the internet, change the database password.** The
> Secret ships a placeholder. Either edit `00-immich-secret.yaml`, or create it
> out-of-band and apply only the rest:
>
> ```sh
> kubectl create secret generic immich-secrets -n dani \
>   --from-literal=DB_PASSWORD="$(openssl rand -hex 16)"
> ```
>
> (If you do that, remove `00-immich-secret.yaml` first - otherwise
> `kubectl apply .` will revert the password to the placeholder.)

Watch it come up (first start pulls images and lets PostgreSQL initialise):

```sh
kubectl get pods -w
kubectl get pvc
kubectl logs -f deploy/immich-server
```

Then open **https://immich.dani.sapi.click** and create the first admin account.

DNS is automatic: external-dns watches the `sapi.click` zone and a
MutatingAdmissionPolicy injects the `external-dns.kubernetes.io/target`
annotation into every Ingress in a tenant namespace, so the A record for
`immich.dani.sapi.click` is published as soon as the Ingress exists (give it a
minute: `dig +short immich.dani.sapi.click`). TLS is automatic too: Traefik issues
a certificate for `immich.dani.sapi.click` - a two-label host the `*.sapi.click`
default wildcard does not cover.

## Files

| file | contents |
|---|---|
| `00-immich-secret.yaml` | `immich-secrets` Secret (PostgreSQL password) |
| `10-postgres.yaml` | PVC (5Gi) + Deployment + Service `postgres` (`immich-app/postgres`, VectorChord) |
| `20-redis.yaml` | Deployment + Service `redis` (Valkey 9, job queue, `emptyDir`) |
| `30-machine-learning.yaml` | Deployment + Service `immich-machine-learning` (CLIP/face inference) |
| `40-immich-server.yaml` | PVC (12Gi) + Deployment + Service `immich-server` (API + web UI + workers) |
| `50-ingress.yaml` | Ingress for `immich.dani.sapi.click` → `immich-server:2283` |

## Things to know

* **Which tenant / host?** The namespace (`dani`) and host
  (`immich.dani.sapi.click`) are hard-coded in each file. To run this for
  another tenant, change `namespace:` in every file and `host:` in
  `50-ingress.yaml` (`grep -rl dani .`).
* **Storage.** The two PVCs land on the cluster default StorageClass,
  `local-path` (k3s's local-path-provisioner): node-local and
  **ReadWriteOnce**. That is why both `immich-server` and `postgres` use
  `strategy: Recreate` - a RollingUpdate would try to mount the same RWO volume
  on a second node and deadlock. `redis` and the ML model cache use
  `emptyDir`s: losing them costs only the job queue and a model re-download.
  Total `requests.storage` is 17Gi, under the tenant quota of 20Gi.
* **Resources.** Deliberately modest limits, because **every container's *limit*
  counts against the tenant ResourceQuota** (`limits.cpu: 8`, `limits.memory:
  16Gi`) - limits are per-namespace budgets, not per-node reservations. The whole
  stack now reserves **3.25 CPU / 7.25Gi** of limits, leaving ~4.7 CPU of
  headroom for other workloads in the namespace. Requests (which the scheduler
  and the `requests.*` quota use) are small: 650m CPU / 2.6Gi. Raise
  `limits.memory` on the ML container if you lean on smart search.
* **Users.** None of these images declares a `USER`, so they run as **root**
  internally (exactly like the compose stack) and the init-time `chown` into the
  `local-path` volumes just works. The strict `restricted` PSA profile is only
  *audited/warned* in tenant namespaces; `baseline` is enforced and these Pods
  satisfy it. If you want to harden to `restricted`, run the server/ML/PG/Valkey
  as uid/gid 1000 **and** make sure the volume is writable by that uid
  (`fsGroup` is not applied to `local-path`/hostPath volumes - pre-`chown` the
  PV directory or use the rootless images).
* **TLS/ACME.** Do **not** add a cert-manager/ACME annotation: the Ingress has
  `tls:` without a secret name, so Traefik auto-issues a certificate for the host
  (this two-label host is not covered by the `*.sapi.click` default wildcard).
* **Area, not just a demo.** Immich is the app; the media library lives in
  `immich-library`. Back that PVC up (or point it at your own storage) before
  putting real photos in it.
