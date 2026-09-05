# Creates a local kind cluster for KubeLens development and testing.
#
# Requirements:
#   - Docker Desktop (or another container runtime) running
#   - kind (https://kind.sigs.k8s.io) — install via:  winget install Kind.Kind
#
# Usage:
#   .\scripts\dev-cluster.ps1          # create the cluster
#   .\scripts\dev-cluster.ps1 -Delete  # delete the cluster
#   .\scripts\dev-cluster.ps1 -Status  # show cluster status

param(
  [switch]$Delete,
  [switch]$Status
)

$ErrorActionPreference = "Stop"
$clusterName = "kubelens"

function Check-Command($name, $installHint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    Write-Error "Missing required tool: $name. $installHint"
  }
}

Check-Command "kind" "Install it with: winget install Kind.Kind"
Check-Command "docker" "Install Docker Desktop from https://www.docker.com/products/docker-desktop/"

if ($Status) {
  kind get clusters
  exit 0
}

if ($Delete) {
  Write-Host "Deleting cluster '$clusterName'..." -ForegroundColor Yellow
  kind delete cluster --name $clusterName
  exit 0
}

$running = docker info *> $null
if (-not $?) {
  Write-Error "Docker is not running. Start Docker Desktop and retry."
}

$existing = kind get clusters
if ($existing -match $clusterName) {
  Write-Host "Cluster '$clusterName' already exists." -ForegroundColor Green
} else {
  Write-Host "Creating cluster '$clusterName'..." -ForegroundColor Cyan
  kind create cluster --name $clusterName
}

$kubeconfig = Join-Path $HOME ".kube" "config"
Write-Host ""
Write-Host "Cluster is ready. KubeLens will auto-discover it from:" -ForegroundColor Green
Write-Host "  $kubeconfig"
Write-Host ""
Write-Host "Verify access with:" -ForegroundColor Cyan
Write-Host '  kubectl get nodes'