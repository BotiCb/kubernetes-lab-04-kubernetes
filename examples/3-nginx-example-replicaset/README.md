# 3-nginx-example-replicaset - nginx owned by a ReplicaSet

```
   https://replicaset.dani.sapi.click ──► Ingress nginx-rs ──► Service nginx-rs:80 ──► 2 Pods (owned by ReplicaSet nginx)
```

## Apply

```sh
export KUBECONFIG=/k8s/20261016-k8s/kubeconfigs/dani.kubeconfig
kubectl apply -f /k8s/20261016-k8s/examples/3-nginx-example-replicaset/
```

## Try it

```sh
kubectl get rs
kubectl get pods -l app=nginx-rs
curl -I https://replicaset.dani.sapi.click      # expect HTTP/2 200
```

It asks for **two** replicas, so two Pods come up. Delete one and the ReplicaSet
recreates it to get back to two:

```sh
kubectl delete pod -l app=nginx-rs
kubectl get pods -w
```

Scale it by editing `replicas` (or imperatively, since a ReplicaSet has no
rollout machinery - only its replica count is mutable):

```sh
kubectl scale rs nginx --replicas=3
```

## Where this sits

| example | controller | keeps Pods alive | rolling updates |
|---|---|---|---|
| [`../1-nginx-example-pod/`](../1-nginx-example-pod) | none | ✗ | ✗ |
| **this one** | ReplicaSet | ✓ | ✗ |
| [`../2-nginx-example-deployment/`](../2-nginx-example-deployment) | Deployment | ✓ | ✓ |

A ReplicaSet reconciles **replica count only**. Change the Pod template and the
existing Pods are *not* replaced - that is why you almost never write one
directly. A Deployment owns a ReplicaSet and simply creates a **new** one for
every template change, which is what gives you rolling updates and
`kubectl rollout undo`.

```sh
kubectl get rs          # after applying ../2-*: nginx-<hash>, owned by the Deployment
```

## Clean up

```sh
kubectl delete -f /k8s/20261016-k8s/examples/3-nginx-example-replicaset/
```
