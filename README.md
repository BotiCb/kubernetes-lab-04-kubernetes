# Microservices and Kubernetes: Lab 4 - Private registries, Pods and Deployments

In Lab 3 you built **multi-architecture** images and pushed them to a **public**
Docker Hub repository.

That is only half the story. An image sitting in a registry does nothing until
something *runs* it - and on this cluster that means Kubernetes objects: a Pod or
Deployment to run the container, a Service to give it a stable address, and an
Ingress to publish it on the internet under your own hostname.

This lab closes that loop. You will:

1. **Run two ready-made examples** that differ in exactly one way - one runs
   nginx as a bare **Pod**, the other as a **Deployment** - and see why the
   difference matters.
2. **Push an image to a *private* registry.** A public image can be pulled by
   anyone; the moment the repository is private, a cluster node gets a `401`
   unless you hand it credentials.
3. **Wire those credentials into Kubernetes** with a `docker-registry`
   `Secret` and `imagePullSecrets`, and publish your own app at
   `myapp.<username>.sapi.click`.

> **Environment.** Everything in this lab targets the `sapi.click` k3s cluster.
> Your namespace is your username and your credentials live in a per-tenant
> kubeconfig. The examples and cluster details below use the `dani` tenant as the
> concrete example - substitute your own username.

---

## My submission (tenant `nboti`)

My app is published at: <https://myapp.nboti.sapi.click>

| What | URL | Source |
|---|---|---|
| **My app** - the Lab 1 notes-api, from a **private** image | <https://myapp.nboti.sapi.click/notes> | [`myapp/myapp.yaml`](myapp/myapp.yaml) |
| nginx as a bare Pod | <https://pod.nboti.sapi.click> | [`examples/1-nginx-example-pod/`](examples/1-nginx-example-pod) |
| nginx as a Deployment | <https://deploy.nboti.sapi.click> | [`examples/2-nginx-example-deployment/`](examples/2-nginx-example-deployment) |
| nginx as a ReplicaSet | <https://replicaset.nboti.sapi.click> | [`examples/3-nginx-example-replicaset/`](examples/3-nginx-example-replicaset) |
| bun-hono example, from a **private** image | <https://protected.nboti.sapi.click> | [`examples/3-protected-image-example/`](examples/3-protected-image-example) |

Both private images live in the **private** Docker Hub repository
`boti13/protected-image`, built for `linux/amd64` + `linux/arm64`:

| Tag | Built from |
|---|---|
| `boti13/protected-image:latest` | [`examples/bun-hono-example/`](examples/bun-hono-example) |
| `boti13/protected-image:notes-api` | `notes-api/` from my Lab 1 repository |

```sh
docker buildx build --platform linux/amd64,linux/arm64 \
  -t boti13/protected-image:latest --push examples/bun-hono-example
docker buildx build --platform linux/amd64,linux/arm64 \
  -t boti13/protected-image:notes-api --push ../kubernetes-lab-01-docker/notes-api
```

### Proof that the repository is private

```console
$ curl -s -o /dev/null -w "%{http_code}" https://hub.docker.com/v2/repositories/boti13/protected-image/
404

$ TOKEN=$(curl -s "https://auth.docker.io/token?service=registry.docker.io&scope=repository:boti13/protected-image:pull" | jq -r .token)
$ curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.oci.image.index.v1+json" \
    https://registry-1.docker.io/v2/boti13/protected-image/manifests/notes-api
401

$ docker buildx imagetools inspect boti13/protected-image:notes-api   # logged in
  Platform:    linux/amd64
  Platform:    linux/arm64
```

### Proof that the cluster pulls it with an `imagePullSecret`

The `dockerhub-pull` Secret holds a **read-only** Docker Hub token, so it is
created with `kubectl` and not committed:

```console
$ kubectl -n nboti create secret docker-registry dockerhub-pull \
    --docker-server=https://index.docker.io/v1/ \
    --docker-username=boti13 \
    --docker-password=<read-only-token> \
    --dry-run=client -o yaml | kubectl apply -f -
secret/dockerhub-pull created

$ kubectl get secret dockerhub-pull
NAME             TYPE                             DATA   AGE
dockerhub-pull   kubernetes.io/dockerconfigjson   1      10m

$ kubectl apply -f myapp/myapp.yaml
$ kubectl describe pod -l app=myapp
...
Events:
  Normal  Scheduled  default-scheduler  Successfully assigned nboti/myapp-68fcc568b4-8rzhp to sapi-worker2
  Normal  Pulling    kubelet            Pulling image "boti13/protected-image:notes-api"
  Normal  Pulled     kubelet            Successfully pulled image "boti13/protected-image:notes-api" in 4.148s
  Normal  Created    kubelet            Container created
  Normal  Started    kubelet            Container started

$ curl -s https://myapp.nboti.sapi.click/health
{"status":"ok","uptime":458}

$ curl -s -X POST https://myapp.nboti.sapi.click/notes \
    -H 'Content-Type: application/json' \
    -d '{"title":"lab 4","body":"served from a private image on k3s"}'
{"id":"8bb4ce1e-563d-4355-9e9d-bd18f39ad52a","title":"lab 4","body":"served from a private image on k3s",...}

$ curl -s https://protected.nboti.sapi.click/
Hello there!
```

The notes are stored on a 1Gi `local-path` PVC, so they survive
`kubectl rollout restart deploy/myapp`.

### Pod vs ReplicaSet vs Deployment

```console
$ curl -sI https://pod.nboti.sapi.click        | head -1   # HTTP/2 200
$ curl -sI https://deploy.nboti.sapi.click     | head -1   # HTTP/2 200
$ curl -sI https://replicaset.nboti.sapi.click | head -1   # HTTP/2 200

$ kubectl delete pod nginx; kubectl delete pod -l app=nginx-deploy; kubectl delete pod -l app=nginx-rs
$ kubectl get pod nginx
Error from server (NotFound): pods "nginx" not found      # nothing recreates a bare Pod
$ kubectl get pods -o custom-columns=NAME:.metadata.name,OWNER:.metadata.ownerReferences[0].kind
NAME                   OWNER
nginx-599579cd-ks7m6   ReplicaSet                         # recreated by the Deployment's ReplicaSet
nginx-v9tn5            ReplicaSet                         # recreated by the ReplicaSet
nginx-x5mqf            ReplicaSet
```

The bare Pod was re-applied afterwards so `pod.nboti.sapi.click` stays up.

---

## 1. The cluster you are deploying to

Worth reading once, because several of these facts are the reason things fail:

| fact | value | consequence for you |
|---|---|---|
| Kubernetes | k3s `v1.37.1+k3s1`, 1 control plane + 2 workers | your Pods land on the workers |
| **Node architecture** | **`arm64`** (both workers) | an `amd64`-only image will **not** start: `exec format error`. Your image must contain `linux/arm64` (Lab 3!) |
| Your namespace | `<username>` (e.g. `dani`) | everything you create lives here |
| Your kubeconfig | `~/.kube/config` | points at your namespace |
| Ingress | Traefik, hostPort 80/443 on the control plane | `ingressClassName: traefik` |
| **DNS** | external-dns watches the `sapi.click` Cloudflare zone | *automatic*: create an Ingress and your A record appears - no annotations |
| **TLS** | Traefik's Let's Encrypt resolver, **per Ingress host** | *automatic*, but a brand-new host can take a minute (a wildcard `*.sapi.click` would **not** cover `myapp.dani.sapi.click`) |
| Pod Security Admission | enforce **`baseline`**, audit/warn `restricted` | running as root is allowed; you'll see a `restricted` **warning** that is not an error |
| ResourceQuota | 4 CPU / 8Gi requests, 8 CPU / 16Gi limits, 20Gi storage | give containers explicit `resources` |
| LimitRange | default 500m CPU / 512Mi, max 4 CPU / 8Gi per container | a container asking for more than 4 CPU is rejected |
| NetworkPolicy | default-deny ingress + allow intra-namespace + allow Traefik | Pods can talk to each other; only Traefik reaches them from outside |

Set up your client's `~/.kube/config`, then run:

```sh
kubectl get pods
```

---

## 2. Repository layout

Everything for this lab lives under [`examples/`](examples):

```text
examples/
├── 1-nginx-example-pod/            #  a bare Pod  + Service + Ingress
│   ├── nginx-pod.yaml
│   └── README.md
├── 2-nginx-example-deployment/     #  a Deployment + Service + Ingress
│   ├── nginx-deployment.yaml
│   └── README.md
├── 3-nginx-example-replicaset/     #  a ReplicaSet + Service + Ingress
│   ├── nginx-replicaset.yaml
│   └── README.md
├── bun-hono-example/               #  the app you containerise and push (private)
│   ├── Dockerfile
│   ├── package.json / bun.lock
│   ├── src/index.ts                #  Hono, answers "Hello there!"
│   └── README.md
├── 3-protected-image-example/      #  pull the PRIVATE image and publish it
│   ├── 00-registry-secret.yaml     #  docker-registry imagePullSecret
│   ├── 10-deployment.yaml          #  imagePullSecrets: [ dockerhub-pull ]
│   ├── 20-service.yaml
│   ├── 30-ingress.yaml
│   └── README.md
└── 4-immich-example/               #  a full real stack, for reference
```

---

## 3. Prerequisites

- `kubectl` (≥ v1.36).
- Your tenant kubeconfig (above).
- **Docker with Buildx** (`docker buildx version`).
- A registry account that can host a **private** repository (the examples use
  Docker Hub as `darktohka/protected-image`).

---

## 4. Part A - Pod vs ReplicaSet vs Deployment

All three nginx examples run the *same* trivial container; only the top-level
object differs:

| | `1-...-pod` | `3-...-replicaset` | `2-...-deployment` |
|---|---|---|---|
| top-level object | `kind: Pod` | `kind: ReplicaSet` | `kind: Deployment` |
| who recreates a dead Pod | nobody | the ReplicaSet | the Deployment's own ReplicaSet |
| rolling updates | ✗ | ✗ | ✓ (`kubectl rollout undo`) |
| host | `pod.dani.sapi.click` | `replicaset.dani.sapi.click` | `deploy.dani.sapi.click` |

A ReplicaSet reconciles **replica count only**: change its Pod template and the
existing Pods are *not* replaced. A Deployment owns a ReplicaSet and creates a
**new** one for every template change - that is what buys you the rollouts.

Apply all three and try them:

```sh
kubectl apply -f examples/1-nginx-example-pod/
kubectl apply -f examples/2-nginx-example-deployment/
kubectl apply -f examples/3-nginx-example-replicaset/
kubectl get pods
curl -I https://pod.dani.sapi.click
curl -I https://deploy.dani.sapi.click
curl -I https://replicaset.dani.sapi.click
```

Now check the state:

```sh
kubectl delete pod nginx                       # the bare Pod
kubectl get pod nginx                          # NotFound - nothing recreates it

kubectl delete pod -l app=nginx-deploy         # owned by the Deployment
kubectl delete pod -l app=nginx-rs             # owned by the ReplicaSet
kubectl get pods -w                            # both come back automatically
kubectl get rs                                 # the Deployment's RS is named nginx-<hash>
```

> **Why you will use Deployments.** Rolling updates, self-healing, scaling and
> `kubectl rollout undo` all come from the controller. A bare Pod is a teaching
> device and a debugging tool, not a deployment strategy - and a ReplicaSet buys
> you the self-healing but not the rollouts.

Clean up when you are done (they use different object names, so you can leave
them running for Part C):

```sh
kubectl delete -f examples/1-nginx-example-pod/
kubectl delete -f examples/2-nginx-example-deployment/
kubectl delete -f examples/3-nginx-example-replicaset/
```

---

## 5. Part B - build and push to a *private* registry

### 5.1 The app

[`examples/bun-hono-example/`](examples/bun-hono-example) is a ~10-line
[Bun](https://bun.sh) + [Hono](https://hono.dev) HTTP server:

```ts
const app = new Hono();
app.get("/", (c) => c.text("Hello there!"));
app.get("/healthz", (c) => c.text("ok"));
export default { port: Number(process.env.PORT ?? 3000), fetch: app.fetch };
```

Try it locally first (no Docker):

```sh
cd examples/bun-hono-example
bun install
bun run src/index.ts &
curl -s http://127.0.0.1:3000/        # Hello there!
```

### 5.2 Build multi-arch and push

The cluster nodes are **arm64**, so - exactly as in Lab 3 - you must build for
`linux/arm64` (do both, so it also runs on your laptop):

```sh
docker login

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t <your-user>/<your-repo>:latest \
  --push examples/bun-hono-example
```

Verify the manifest lists both platforms:

```sh
docker buildx imagetools inspect <your-user>/<your-repo>:latest
#   Platform: linux/amd64
#   Platform: linux/arm64
```

### 5.3 Make the repository private

This is the whole point of the exercise. On Docker Hub:

- **Account settings → Default privacy → Private**, or
- create the repository explicitly as private.

If you want to script it, the Docker Hub API creates a private repo with:

```sh
curl -sS -X POST -H "Authorization: Bearer <JWT>" \
  -H 'Content-Type: application/json' \
  -d '{"namespace":"<your-user>","name":"<your-repo>","is_private":true}' \
  https://hub.docker.com/v2/repositories/
```

(Docker Hub returns `404` for a private repository you ask about anonymously -
that is how you can tell it is private.)

---

## 6. Part C - give Kubernetes the credentials

### 6.1 The problem

Point a Deployment at a private image and, without credentials, the Pod sits in
**`ImagePullBackOff`**:

```
Failed to pull image "darktohka/protected-image:latest":
  ... 401 Unauthorized
```

The kubelet used no credentials, the registry refused, and it will retry with
exponential backoff - forever.

### 6.2 The fix: a `docker-registry` Secret

Kubernetes has a dedicated Secret type for registry credentials. The easy way to
create it is not to hand-write YAML but to let `kubectl` do it:

```sh
kubectl -n <username> create secret docker-registry dockerhub-pull \
  --docker-server=https://index.docker.io/v1/ \
  --docker-username=<your-user> \
  --docker-password=<a READ-ONLY token> \
  --dry-run=client -o yaml | kubectl apply -f -
```

That produces (the [`3-protected-image-example/00-registry-secret.yaml`](examples/3-protected-image-example/00-registry-secret.yaml)
shows the same thing written out):

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: dockerhub-pull
type: kubernetes.io/dockerconfigjson
stringData:
  .dockerconfigjson: |
    {"auths":{"https://index.docker.io/v1/":{"auth":"<base64 user:token>"}}}
```

> **Use a scoped, read-only token, not your password**, and remember that
> anything that can read Secrets in your namespace can read this one.

### 6.3 Reference it from the Pod

`imagePullSecrets` is a **Pod** field (in a Deployment it goes under
`spec.template.spec`):

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: protected-image
spec:
  replicas: 1
  selector:
    matchLabels: { app: protected-image }
  template:
    metadata:
      labels: { app: protected-image }
    spec:
      imagePullSecrets:
        - name: dockerhub-pull        # <-- the Secret from 6.2
      containers:
        - name: app
          image: darktohka/protected-image:latest
          ports:
            - name: http
              containerPort: 3000
          resources:
            requests: { cpu: 25m, memory: 64Mi }
            limits:   { cpu: 250m, memory: 256Mi }
```

### 6.4 Service and Ingress

A **Service** gives the Pod a stable DNS name and virtual IP
(`protected-image.<namespace>.svc.cluster.local`) - Pod IPs are ephemeral, so you
never target them directly. An **Ingress** maps a hostname to a Service:

```yaml
apiVersion: v1
kind: Service
metadata: { name: protected-image }
spec:
  selector: { app: protected-image }
  ports: [{ port: 80, targetPort: 3000 }]
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata: { name: protected-image }
spec:
  ingressClassName: traefik
  rules:
    - host: protected.dani.sapi.click
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service: { name: protected-image, port: { number: 80 } }
  tls:
    - hosts: [ protected.dani.sapi.click ]
```

Note there is **no annotation anywhere**. `tls:` with no secret name tells
Traefik to obtain a certificate for the host itself.

### 6.5 Apply and verify

```sh
kubectl apply -f examples/3-protected-image-example/
kubectl get pods -w                       # Running, not ImagePullBackOff
kubectl exec deploy/protected-image -- wget -qO- http://127.0.0.1:3000/
#   Hello there!
curl -s https://protected.dani.sapi.click/
#   Hello there!
```

### 6.6 Your turn: `myapp.<username>.sapi.click`

Take **the image you built in the previous labs** and publish it:

1. Push it to a **private** repository (Part B).
2. Create the pull secret (6.2).
3. Deploy it. Start from this skeleton and change the four marked values:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
  namespace: <username>
spec:
  replicas: 1
  selector: { matchLabels: { app: myapp } }
  template:
    metadata: { labels: { app: myapp } }
    spec:
      imagePullSecrets: [{ name: dockerhub-pull }]
      containers:
        - name: myapp
          image: <your-user>/<your-repo>:latest   # <-- 1
          ports: [{ containerPort: <your-port> }] # <-- 2
          resources:
            requests: { cpu: 25m, memory: 64Mi }
            limits:   { cpu: 250m, memory: 256Mi }
---
apiVersion: v1
kind: Service
metadata: { name: myapp, namespace: <username> }
spec:
  selector: { app: myapp }
  ports: [{ port: 80, targetPort: <your-port> }]
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata: { name: myapp, namespace: <username> }
spec:
  ingressClassName: traefik
  rules:
    - host: myapp.<username>.sapi.click        # <-- 3
      http:
        paths:
          - { path: /, pathType: Prefix, backend: { service: { name: myapp, port: { number: 80 } } } }
  tls:
    - hosts: [ myapp.<username>.sapi.click ]   # <-- 4
```

```sh
kubectl apply -f myapp.yaml
kubectl get pods -w
curl -I https://myapp.<username>.sapi.click
```

---

## 7. Troubleshooting

| symptom | cause | fix |
|---|---|---|
| `ImagePullBackOff` / `401 Unauthorized` | no/incorrect registry credentials | create the `docker-registry` Secret and add `imagePullSecrets` |
| `ImagePullBackOff` with a *newly created* secret | Secret in the wrong namespace | the Secret must be in the **same namespace** as the Pod |
| `exec format error`, or `no match for platform` | image built `amd64`-only, node is `arm64` | rebuild with `--platform linux/arm64` (Lab 3) |
| Pod stuck `Pending` | unschedulable - quota exceeded or no capacity | `kubectl describe pod` → check the Events for quota/taint messages |
| `CreateContainerConfigError` | referenced Secret/ConfigMap missing | create it first; check the name/namespace |
| `CrashLoopBackOff` | the app exits at startup | `kubectl logs` / `kubectl logs --previous` |
| `curl: (6) Could not resolve host` | DNS not published yet - or a **cached NXDOMAIN** | check `dig +short <host> @1.1.1.1`; wait ~1 min |

Debugging toolkit:

```sh
kubectl get pods -o wide
kubectl describe pod <pod>            # Events are the single most useful output
kubectl logs <pod>
kubectl get events --sort-by=.lastTimestamp
kubectl auth can-i create deployments # am I even allowed?
```

---

## 8. Submission

1. Both nginx examples running and reachable (`pod.` and `deploy.`).
2. Your own image pushed to a **private** registry, with proof it is private.
3. `myapp.<username>.sapi.click` serving your app from that private image,
   using an `imagePullSecret` (include `kubectl get secret` + a `curl` of the URL,
   or `kubectl describe pod` showing the pull succeeded).
4. Share the link in this repository.

---

## 9. Further reading

- Pods - <https://kubernetes.io/docs/concepts/workloads/pods/>
- Deployments - <https://kubernetes.io/docs/concepts/workloads/controllers/deployment/>
- Images & `imagePullSecrets` - <https://kubernetes.io/docs/concepts/containers/images/#specifying-imagepullsecrets-on-a-pod>
- `docker-registry` Secrets - <https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/>
- Services - <https://kubernetes.io/docs/concepts/services-networking/service/>
- Ingress - <https://kubernetes.io/docs/concepts/services-networking/ingress/>
- Traefik Kubernetes Ingress - <https://doc.traefik.io/traefik/providers/kubernetes-ingress/>
- Pod Security Standards - <https://kubernetes.io/docs/concepts/security/pod-security-standards/>
