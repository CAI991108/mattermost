#!/usr/bin/env bash
set -Eeuo pipefail

script_path=$(readlink -f -- "${BASH_SOURCE[0]}")
script_dir=$(CDPATH='' cd -- "$(dirname -- "$script_path")" && pwd -P)
repo_root=$(CDPATH='' cd -- "$script_dir/../.." && pwd -P)
deployment_env_path="$script_dir/.env"
upgrade_runtime_dir=/run/iuin-upgrade
env_snapshot_path=

die() {
    printf 'ERROR: %s\n' "$*" >&2
    exit 1
}

usage() {
    printf 'Usage: sudo %s --expected-commit <40-character-lowercase-git-sha>\n' "${0##*/}"
}

require_root() {
    [[ $EUID -eq 0 ]] || die "run this script as root"
}

repo_git() {
    git -c "safe.directory=$repo_root" -C "$repo_root" "$@"
}

validate_expected_commit() {
    local expected_commit=$1
    local resolved_commit

    [[ "$expected_commit" =~ ^[0-9a-f]{40}$ ]] \
        || die "expected commit must be a full 40-character lowercase Git SHA"
    resolved_commit=$(repo_git rev-parse --verify "${expected_commit}^{commit}" 2>/dev/null) \
        || die "expected commit does not identify a commit in this repository"
    [[ "$resolved_commit" == "$expected_commit" ]] \
        || die "expected commit did not resolve exactly"
}

validate_checkout() {
    local expected_commit=$1
    local current_commit
    local current_status

    current_commit=$(repo_git rev-parse --verify HEAD) \
        || die "cannot read the repository HEAD"
    [[ "$current_commit" == "$expected_commit" ]] \
        || die "repository HEAD is $current_commit, expected $expected_commit"

    current_status=$(repo_git status --porcelain --untracked-files=normal) \
        || die "cannot inspect the repository worktree"
    if [[ -n "$current_status" ]]; then
        printf '%s\n' "$current_status" >&2
        die "refusing to upgrade from a dirty Git worktree"
    fi
}

secure_environment_file() {
    [[ -f "$deployment_env_path" && ! -L "$deployment_env_path" ]] \
        || die "deployment environment must be a regular file: $deployment_env_path"
    chown -- root:root "$deployment_env_path"
    chmod -- 0600 "$deployment_env_path"
    [[ $(stat -c '%u:%g:%a:%h' -- "$deployment_env_path") == "0:0:600:1" ]] \
        || die "deployment environment must be root:root, mode 0600, with one hard link"
}

prepare_snapshot_runtime_directory() {
    install -d -m 0700 -o root -g root -- "$upgrade_runtime_dir"
    [[ -d "$upgrade_runtime_dir" && ! -L "$upgrade_runtime_dir" \
        && $(stat -c '%u:%g:%a' -- "$upgrade_runtime_dir") == "0:0:700" ]] \
        || die "upgrade runtime directory must be root:root and mode 0700: $upgrade_runtime_dir"
}

create_environment_snapshot() {
    local env_fd

    prepare_snapshot_runtime_directory
    exec {env_fd}<"$deployment_env_path"
    [[ -f "$deployment_env_path" && ! -L "$deployment_env_path" \
        && "$deployment_env_path" -ef "/proc/self/fd/$env_fd" \
        && $(stat -Lc '%F:%u:%g:%a:%h' -- "/proc/self/fd/$env_fd") \
        == "regular file:0:0:600:1" ]] \
        || die "opened deployment environment is not the secured regular file"

    umask 077
    env_snapshot_path=$(mktemp "$upgrade_runtime_dir/environment.XXXXXX")
    cp --preserve=none -- "/proc/self/fd/$env_fd" "$env_snapshot_path"
    exec {env_fd}<&-
    chown -- root:root "$env_snapshot_path"
    chmod -- 0600 "$env_snapshot_path"
    [[ -f "$env_snapshot_path" && ! -L "$env_snapshot_path" \
        && $(stat -c '%u:%g:%a:%h' -- "$env_snapshot_path") == "0:0:600:1" ]] \
        || die "deployment environment snapshot is not protected"
}

cleanup_environment_snapshot() {
    local snapshot=${env_snapshot_path:-}

    env_snapshot_path=
    [[ -n "$snapshot" ]] || return 0
    [[ $(dirname -- "$snapshot") == "$upgrade_runtime_dir" \
        && $(basename -- "$snapshot") == environment.* ]] \
        || die "refusing to clean an unexpected environment snapshot path: $snapshot"
    rm -f -- "$snapshot"
}

execute_compose_validation() {
    docker compose "$@"
}

validate_compose_configuration() {
    execute_compose_validation \
        --project-directory "$script_dir" \
        --env-file "$env_snapshot_path" \
        --file "$script_dir/compose.yaml" \
        config \
        --quiet
}

execute_backup() {
    "$@"
}

run_backup() {
    ENV_FILE="$env_snapshot_path" execute_backup "$script_dir/backup.sh"
}

execute_deployment() {
    "$@"
}

run_deployment() {
    local expected_commit=$1

    ENV_FILE="$env_snapshot_path" execute_deployment \
        "$script_dir/deploy.sh" --expected-commit "$expected_commit"
}

execute_runtime_version() {
    timeout --kill-after=10s 30s \
        docker exec iuin-server /mattermost/bin/mattermost version
}

read_runtime_commit() {
    execute_runtime_version 2>/dev/null \
        | awk -F': ' '$1 == "Build Hash" { print $2; exit }'
}

main() {
    if [[ ${1:-} == "--help" || ${1:-} == "-h" ]]; then
        usage
        exit 0
    fi
    if [[ $# -ne 2 || $1 != "--expected-commit" ]]; then
        usage >&2
        exit 2
    fi

    local expected_commit=$2
    local current_branch
    local runtime_commit

    [[ $(repo_git rev-parse --is-inside-work-tree 2>/dev/null) == true ]] \
        || die "repository metadata is missing: $repo_root"
    validate_expected_commit "$expected_commit"
    require_root
    validate_checkout "$expected_commit"

    printf 'Securing %s\n' "$deployment_env_path"
    secure_environment_file

    printf 'Creating a protected deployment environment snapshot\n'
    trap cleanup_environment_snapshot EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    create_environment_snapshot

    printf 'Validating the production Compose configuration\n'
    validate_compose_configuration

    printf 'Creating the pre-upgrade production backup\n'
    run_backup || die "production backup failed"

    printf 'Revalidating the approved checkout after backup\n'
    validate_checkout "$expected_commit"

    printf 'Deploying approved commit %s\n' "$expected_commit"
    run_deployment "$expected_commit" || die "production deployment failed"

    validate_checkout "$expected_commit"
    runtime_commit=$(read_runtime_commit) \
        || die "cannot read the running Mattermost build hash"
    [[ "$runtime_commit" == "$expected_commit" ]] \
        || die "running Mattermost build hash is $runtime_commit, expected $expected_commit"

    cleanup_environment_snapshot
    trap - EXIT INT TERM
    current_branch=$(repo_git symbolic-ref --short -q HEAD \
        || printf '%s' 'detached-head')
    printf 'Production upgrade completed successfully\n'
    printf 'Branch: %s\n' "$current_branch"
    printf 'Commit: %s\n' "$expected_commit"
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
    main "$@"
fi
