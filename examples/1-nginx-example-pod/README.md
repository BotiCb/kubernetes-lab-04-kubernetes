# 1-nginx-example-pod - the same nginx, as a single bare Pod

```
   https://pod.dani.sapi.click ──► Ingress nginx-pod ──► Service nginx-pod:80 ──► Pod nginx:80
```

## Apply

```sh
export KUBECONFIG=/k8s/20261016-k8s/kubeconfigs/dani.kubeconfig
kubectl apply -f /k8s/20261016-k8s/examples/1-nginx-example-pod/
```

## Try it

```sh
kubectl get pod nginx
curl -I https://pod.dani.sapi.click          # expect HTTP/2 200
```

## The catch

A bare `kind: Pod` has **no controller**. Delete it, or let its node reboot, and
it does not come back:

```sh
kubectl delete pod nginx
kubectl get pod nginx        # NotFound - nothing recreated it
```

Compare with [`../2-nginx-example-deployment/`](../2-nginx-example-deployment),
where deleting the Pod just makes the Deployment create a new one.

## Clean up

```sh
kubectl delete -f /k8s/20261016-k8s/examples/1-nginx-example-pod/
```
