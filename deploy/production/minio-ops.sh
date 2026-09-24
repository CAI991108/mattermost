#!/bin/sh
set -eu

mode=${1:-init}
bucket=${MINIO_BUCKET:-mattermost}

read_secret() {
    value=$(tr -d '\r\n' < "$1")
    if [ -z "$value" ]; then
        echo "empty secret: $1" >&2
        exit 1
    fi
    printf '%s' "$value"
}

root_user=$(read_secret /run/secrets/minio_root_user)
root_password=$(read_secret /run/secrets/minio_root_password)
app_access_key=$(read_secret /run/secrets/mattermost_s3_access_key)
app_secret_key=$(read_secret /run/secrets/mattermost_s3_secret_key)

mc alias set local http://minio:9000 "$root_user" "$root_password" >/dev/null

case "$mode" in
    init|reconcile)
        mc mb --ignore-existing "local/$bucket"
        policy=/tmp/mattermost-policy.json
        printf '%s\n' \
          '{' \
          '  "Version": "2012-10-17",' \
          '  "Statement": [' \
          '    {' \
          '      "Effect": "Allow",' \
          "      \"Action\": [\"s3:GetBucketLocation\", \"s3:ListBucket\", \"s3:ListBucketMultipartUploads\"]," \
          "      \"Resource\": [\"arn:aws:s3:::$bucket\"]" \
          '    },' \
          '    {' \
          '      "Effect": "Allow",' \
          "      \"Action\": [\"s3:GetObject\", \"s3:PutObject\", \"s3:DeleteObject\", \"s3:AbortMultipartUpload\", \"s3:ListMultipartUploadParts\"]," \
          "      \"Resource\": [\"arn:aws:s3:::$bucket/*\"]" \
          '    }' \
          '  ]' \
          '}' > "$policy"
        mc admin user add local "$app_access_key" "$app_secret_key"
        mc admin policy create local mattermost-app "$policy"
        mc admin policy attach local mattermost-app --user "$app_access_key"
        mc anonymous set none "local/$bucket" >/dev/null
        mc alias set app http://minio:9000 "$app_access_key" "$app_secret_key" >/dev/null
        mc stat "app/$bucket" >/dev/null
        if [ "$mode" = init ]; then
            test -d /seed/profile/honors
            mc mirror --overwrite /seed/profile/honors "app/$bucket/profile/honors"
        fi
        mc stat "app/$bucket/profile/honors/achievements/achv_profile_anchor/icon.png" >/dev/null
        ;;
    check)
        mc alias set app http://minio:9000 "$app_access_key" "$app_secret_key" >/dev/null
        mc stat "app/$bucket" >/dev/null
        mc stat "app/$bucket/profile/honors/achievements/achv_profile_anchor/icon.png" >/dev/null
        ;;
    backup)
        destination=${2:?backup destination is required}
        case "$destination" in
            /backups/*) ;;
            *) echo "backup destination must be below /backups" >&2; exit 2 ;;
        esac
        mkdir -p "$destination"
        mc mirror --overwrite --preserve "local/$bucket" "$destination"
        ;;
    restore)
        source_path=${2:?restore source is required}
        case "$source_path" in
            /backups/*) ;;
            *) echo "restore source must be below /backups" >&2; exit 2 ;;
        esac
        test -d "$source_path"
        mc mirror --overwrite --remove "$source_path" "local/$bucket"
        ;;
    *)
        echo "usage: minio-ops.sh {init|reconcile|check|backup PATH|restore PATH}" >&2
        exit 2
        ;;
esac
