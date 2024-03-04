#! /usr/bin/env bash

set -e

DOCKER_COMPOSE="env MONGODB_VERSION= docker compose"

echo "Checking if docker is available ..."

if ! docker version &>/dev/null; then
  echo "  docker could not be found"
  exit
elif ! docker compose version &>/dev/null; then
  echo "  docker compose could not be found, trying standalone docker-compose as a fallback"
  if ! docker-compose version &>/dev/null; then
    echo "  docker-compose could not be found"
    exit
  fi
  # TODO(COMPASS-7687): This is only here because of rhel76 that is old enough
  # that the docker version installed there doesn't include compose. DevProd
  # team suggests that we should switch to Podman on RHEL
  DOCKER_COMPOSE="env MONGODB_VERSION= docker-compose"
fi

echo "Found docker:"
docker version
$DOCKER_COMPOSE version

echo "Starting test environments"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
LOGS_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOGS_DIR"

git clone -b v1.3.2 --single-branch https://github.com/mongodb-js/devtools-docker-test-envs.git test-envs
$DOCKER_COMPOSE -f test-envs/docker/enterprise/docker-compose.yaml up -d
$DOCKER_COMPOSE -f test-envs/docker/ldap/docker-compose.yaml up -d
$DOCKER_COMPOSE -f test-envs/docker/scram/docker-compose.yaml up -d
$DOCKER_COMPOSE -f test-envs/docker/sharded/docker-compose.yaml up -d
$DOCKER_COMPOSE -f test-envs/docker/ssh/docker-compose.yaml up -d
$DOCKER_COMPOSE -f test-envs/docker/tls/docker-compose.yaml up -d
$DOCKER_COMPOSE -f test-envs/docker/kerberos/docker-compose.yaml up -d

__stop_all_docker_containers() {
  echo "Stopping test environments"
  $DOCKER_COMPOSE -f test-envs/docker/enterprise/docker-compose.yaml ps >$LOGS_DIR/docker-enterprise.ps || true
  $DOCKER_COMPOSE -f test-envs/docker/ldap/docker-compose.yaml ps >$LOGS_DIR/docker-ldap.ps || true
  $DOCKER_COMPOSE -f test-envs/docker/scram/docker-compose.yaml ps >$LOGS_DIR/docker-scram.ps || true
  $DOCKER_COMPOSE -f test-envs/docker/sharded/docker-compose.yaml ps >$LOGS_DIR/docker-sharded.ps || true
  $DOCKER_COMPOSE -f test-envs/docker/ssh/docker-compose.yaml ps >$LOGS_DIR/docker-ssh.ps || true
  $DOCKER_COMPOSE -f test-envs/docker/tls/docker-compose.yaml ps >$LOGS_DIR/docker-tls.ps || true
  $DOCKER_COMPOSE -f test-envs/docker/kerberos/docker-compose.yaml ps >$LOGS_DIR/docker-kerberos.ps || true

  $DOCKER_COMPOSE -f test-envs/docker/enterprise/docker-compose.yaml logs >$LOGS_DIR/docker-enterprise.log || true
  $DOCKER_COMPOSE -f test-envs/docker/ldap/docker-compose.yaml logs >$LOGS_DIR/docker-ldap.log || true
  $DOCKER_COMPOSE -f test-envs/docker/scram/docker-compose.yaml logs >$LOGS_DIR/docker-scram.log || true
  $DOCKER_COMPOSE -f test-envs/docker/sharded/docker-compose.yaml logs >$LOGS_DIR/docker-sharded.log || true
  $DOCKER_COMPOSE -f test-envs/docker/ssh/docker-compose.yaml logs >$LOGS_DIR/docker-ssh.log || true
  $DOCKER_COMPOSE -f test-envs/docker/tls/docker-compose.yaml logs >$LOGS_DIR/docker-tls.log || true
  $DOCKER_COMPOSE -f test-envs/docker/kerberos/docker-compose.yaml logs >$LOGS_DIR/docker-kerberos.log || true

  $DOCKER_COMPOSE -f test-envs/docker/enterprise/docker-compose.yaml down -v --remove-orphans
  $DOCKER_COMPOSE -f test-envs/docker/ldap/docker-compose.yaml down -v --remove-orphans
  $DOCKER_COMPOSE -f test-envs/docker/scram/docker-compose.yaml down -v --remove-orphans
  $DOCKER_COMPOSE -f test-envs/docker/sharded/docker-compose.yaml down -v --remove-orphans
  $DOCKER_COMPOSE -f test-envs/docker/ssh/docker-compose.yaml down -v --remove-orphans
  $DOCKER_COMPOSE -f test-envs/docker/tls/docker-compose.yaml down -v --remove-orphans
  $DOCKER_COMPOSE -f test-envs/docker/kerberos/docker-compose.yaml down -v --remove-orphans
}

trap "__stop_all_docker_containers" EXIT
