#!/bin/bash
set -e

API="pelias-api"
DOCKER_IMAGE="hsldevcom/$API"

# master is published as "latest", other branches (e.g. hotfix) under their branch name
BRANCH=${GITHUB_REF_NAME:-master}
if [ "$BRANCH" = "master" ]; then
    DOCKER_TAG="latest"
else
    DOCKER_TAG="$BRANCH"
fi

COMMIT_HASH=$(git rev-parse --short "$GITHUB_SHA")

DOCKER_TAG_LONG=$DOCKER_TAG-$(date +"%Y-%m-%dT%H.%M.%S")-$COMMIT_HASH
DOCKER_IMAGE_TAG=$DOCKER_IMAGE:$DOCKER_TAG
DOCKER_IMAGE_TAG_LONG=$DOCKER_IMAGE:$DOCKER_TAG_LONG

# Build image
echo Building pelias-api
docker build --tag="$DOCKER_IMAGE_TAG_LONG" .
docker run --name $API -p 3100:8080 --rm $DOCKER_IMAGE_TAG_LONG &
sleep 20
HOST=$(docker inspect --format '{{ .NetworkSettings.IPAddress }}' $API)
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://$HOST:8080/v1)
docker stop $API

if [ $STATUS_CODE = 200 ]; then
    echo "Image runs OK"
else
    echo "Could not launch pelias api image"
    # exit with an error
    exit 1
fi

docker login -u $DOCKER_USER -p $DOCKER_AUTH
echo "Pushing $DOCKER_TAG image"
docker push $DOCKER_IMAGE_TAG_LONG
docker tag $DOCKER_IMAGE_TAG_LONG $DOCKER_IMAGE_TAG
docker push $DOCKER_IMAGE_TAG

echo Build completed
