# 2-nginx-example-deployment - the same nginx, owned by a Deployment

```
   https://deploy.dani.sapi.click ──► Ingress nginx-deploy ──► Service nginx-deploy:80 ──► Pod (owned by Deployment nginx)
```

## Apply

```sh
export KUBECONFIG=/k8s/20261016-k8s/kubeconfigs/dani.kubeconfig
kubectl apply -f /k8s/20261016-k8s/examples/2-nginx-example-deployment/
```

## Try it

```sh
kubectl get deploy,pods
curl -I https://deploy.dani.sapi.click      # expect HTTP/2 200
```

## Why prefer this over a bare Pod

The Deployment's ReplicaSet keeps `replicas: 1` Pods running. Delete one and a
replacement appears within seconds:

```sh
kubectl delete pod -l app=nginx-deploy
kubectl get pods -w          # a new Pod is created
```

That is the difference from [`../1-nginx-example-pod/`](../1-nginx-example-pod),
where a deleted Pod is gone for good.

## Clean up

```sh
kubectl delete -f /k8s/20261016-k8s/examples/2-nginx-example-deployment/
```
