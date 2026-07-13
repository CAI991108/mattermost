#!/bin/sh
set -eu

read_secret() {
    secret_path=$1
    secret_name=$2
    if [ ! -r "$secret_path" ]; then
        echo "required secret is not readable: $secret_name" >&2
        exit 1
    fi
    secret_value=$(tr -d '\r\n' < "$secret_path")
    if [ -z "$secret_value" ]; then
        echo "required secret is empty: $secret_name" >&2
        exit 1
    fi
    printf '%s' "$secret_value"
}

MINIO_ROOT_USER=$(read_secret "${MINIO_ROOT_USER_FILE:?}" minio_root_user)
MINIO_ROOT_PASSWORD=$(read_secret "${MINIO_ROOT_PASSWORD_FILE:?}" minio_root_password)
export MINIO_ROOT_USER MINIO_ROOT_PASSWORD
unset MINIO_ROOT_USER_FILE MINIO_ROOT_PASSWORD_FILE

exec /usr/local/bin/minio "$@"
