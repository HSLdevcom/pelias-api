#!/bin/bash
set -e

API="pelias-api"
DOCKER_IMAGE="hsldevcom/$API"
DOCKER_TAG="latest"

COMMIT_HASH=$(git rev-parse --short "$GITHUB_SHA")

DOCKER_TAG_LONG=$DOCKER_TAG-$(date +"%Y-%m-%dT%H.%M.%S")-$COMMIT_HASH
DOCKER_IMAGE_TAG=$DOCKER_IMAGE:$DOCKER_TAG
DOCKER_IMAGE_TAG_LONG=$DOCKER_IMAGE:$DOCKER_TAG_LONG

# Build image
echo Building pelias-api
docker build --tag="$DOCKER_IMAGE_TAG_LONG" .
docker run --name $API -p 3100:8080 --rm $DOCKER_IMAGE_TAG_LONG &
sleep 20
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/v1)
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
