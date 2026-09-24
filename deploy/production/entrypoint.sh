#!/bin/sh
set -eu

umask 027

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

if [ ! -s /mattermost/config/config.json ]; then
    cp /opt/iuin/default-config.json /mattermost/config/config.json
    chmod 0600 /mattermost/config/config.json
fi

db_password=$(read_secret "${MM_SQLSETTINGS_DATASOURCE_FILE:?}" mattermost_db_password)
s3_access_key=$(read_secret "${MM_FILESETTINGS_AMAZONS3ACCESSKEYID_FILE:?}" mattermost_s3_access_key)
s3_secret_key=$(read_secret "${MM_FILESETTINGS_AMAZONS3SECRETACCESSKEY_FILE:?}" mattermost_s3_secret_key)

# bootstrap.sh generates a hexadecimal database password, so no URI escaping is
# required. Keep the assembled DSN out of Compose configuration and Git.
export MM_SQLSETTINGS_DATASOURCE="postgres://${POSTGRES_USER:-mattermost}:${db_password}@postgres:5432/${POSTGRES_DB:-mattermost}?connect_timeout=10&sslmode=disable"
export MM_FILESETTINGS_AMAZONS3ACCESSKEYID="$s3_access_key"
export MM_FILESETTINGS_AMAZONS3SECRETACCESSKEY="$s3_secret_key"
unset MM_SQLSETTINGS_DATASOURCE_FILE
unset MM_FILESETTINGS_AMAZONS3ACCESSKEYID_FILE
unset MM_FILESETTINGS_AMAZONS3SECRETACCESSKEY_FILE
unset db_password s3_access_key s3_secret_key

exec "$@"
