#!/usr/bin/env bash
# shellcheck disable=SC2317
set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=upgrade.sh
source "$SCRIPT_DIR/upgrade.sh"
# shellcheck source=deploy-arguments.sh
source "$SCRIPT_DIR/deploy-arguments.sh"

test_tmp=$(mktemp -d)
trap 'rm -rf -- "$test_tmp"' EXIT
expected_commit=$(git -C "$repo_root" rev-parse --verify HEAD)
zero_commit=0000000000000000000000000000000000000000

fail() {
    printf 'FAIL: %s\n' "$*" >&2
    exit 1
}

assert_failure_contains() {
    local expected_message=$1
    shift
    local output

    if output=$("$@" 2>&1); then
        fail "command unexpectedly succeeded: $*"
    fi
    grep -Fq -- "$expected_message" <<<"$output" \
        || fail "missing failure message '$expected_message' in: $output"
}

assert_failure_contains "full 40-character lowercase Git SHA" \
    validate_expected_commit bad
assert_failure_contains "does not identify a commit" \
    validate_expected_commit "$zero_commit"

dirty_checkout_case() {
    repo_git() {
        case "$*" in
            "rev-parse --verify HEAD") printf '%s\n' "$expected_commit" ;;
            "status --porcelain --untracked-files=normal") printf '%s\n' " M fake-change" ;;
            *) return 1 ;;
        esac
    }
    validate_checkout "$expected_commit"
}
assert_failure_contains "dirty Git worktree" \
    dirty_checkout_case

parse_deploy_arguments --expected-commit "$expected_commit" --resume-superseded-deploy
[[ "$expected_deploy_commit" == "$expected_commit" \
    && "$resume_superseded_deploy" == true ]] \
    || fail "deploy arguments were not parsed in forward order"
parse_deploy_arguments --resume-superseded-deploy --expected-commit "$expected_commit"
[[ "$expected_deploy_commit" == "$expected_commit" \
    && "$resume_superseded_deploy" == true ]] \
    || fail "deploy arguments were not parsed in reverse order"
assert_failure_contains "duplicate deployment argument" \
    parse_deploy_arguments --resume-superseded-deploy --resume-superseded-deploy
assert_failure_contains "duplicate deployment argument" \
    parse_deploy_arguments --expected-commit "$expected_commit" \
        --expected-commit "$expected_commit"
assert_failure_contains "missing value" parse_deploy_arguments --expected-commit
assert_failure_contains "full 40-character lowercase Git SHA" \
    parse_deploy_arguments --expected-commit BAD
assert_failure_contains "unsupported deployment argument" \
    parse_deploy_arguments --unknown

deployment_repo_git() {
    printf '%s\n' "$expected_commit"
}
parse_deploy_arguments --expected-commit "$expected_commit"
validate_expected_deploy_commit "$expected_commit"
assert_failure_contains "repository HEAD is" \
    validate_expected_deploy_commit "$zero_commit"
deployment_repo_git() {
    return 1
}
assert_failure_contains "does not identify a commit" \
    validate_expected_deploy_commit "$expected_commit"

timeout() {
    [[ "$1" == --kill-after=10s && "$2" == 30s \
        && "$3" == docker && "$4" == exec && "$5" == iuin-server \
        && "$6" == /mattermost/bin/mattermost && "$7" == version ]] \
        || fail "runtime version command is not correctly bounded: $*"
    printf 'Build Hash: %s\n' "$expected_commit"
}
[[ $(execute_runtime_version) == "Build Hash: $expected_commit" ]] \
    || fail "bounded runtime version command returned unexpected output"
unset -f timeout

events="$test_tmp/events"
record() {
    printf '%s\n' "$1" >>"$events"
}

reset_upgrade_fakes() {
    : >"$events"
    upgrade_runtime_dir="$test_tmp"
    env_snapshot_path=
    require_root() { record root; }
    repo_git() {
        case "$*" in
            "rev-parse --is-inside-work-tree") printf '%s\n' true ;;
            "symbolic-ref --short -q HEAD") printf '%s\n' test-branch ;;
            *) fail "unexpected repo_git call: $*" ;;
        esac
    }
    validate_expected_commit() { record "expected:$1"; }
    validate_checkout() { record "checkout:$1"; }
    secure_environment_file() { record secure; }
    create_environment_snapshot() {
        env_snapshot_path="$test_tmp/environment.mock"
        : >"$env_snapshot_path"
        record snapshot
    }
    execute_compose_validation() {
        [[ " $* " == *" --env-file $env_snapshot_path "* ]] \
            || fail "Compose did not receive the environment snapshot"
        record compose
    }
    execute_backup() {
        [[ "${ENV_FILE:-}" == "$env_snapshot_path" ]] \
            || fail "backup did not receive the environment snapshot"
        [[ "$1" == "$script_dir/backup.sh" ]] \
            || fail "unexpected backup command: $*"
        record backup
    }
    execute_deployment() {
        [[ "${ENV_FILE:-}" == "$env_snapshot_path" ]] \
            || fail "deployment did not receive the environment snapshot"
        [[ "$1" == "$script_dir/deploy.sh" \
            && "$2" == --expected-commit && "$3" == "$expected_commit" ]] \
            || fail "deployment did not receive the approved commit"
        record deploy
    }
    execute_runtime_version() {
        record runtime
        printf 'Version: test\nBuild Hash: %s\n' "$expected_commit"
    }
}

reset_upgrade_fakes
(main --expected-commit "$expected_commit") >/dev/null
[[ ! -e "$test_tmp/environment.mock" ]] \
    || fail "successful upgrade did not clean the environment snapshot"
expected_events=$'expected:'"$expected_commit"$'\nroot\ncheckout:'"$expected_commit"$'\nsecure\nsnapshot\ncompose\nbackup\ncheckout:'"$expected_commit"$'\ndeploy\ncheckout:'"$expected_commit"$'\nruntime'
[[ $(<"$events") == "$expected_events" ]] \
    || fail "unexpected success order: $(<"$events")"

reset_upgrade_fakes
execute_backup() {
    record backup-failed
    return 1
}
assert_failure_contains "production backup failed" \
    main --expected-commit "$expected_commit"
! grep -Fqx deploy "$events" || fail "deployment ran after backup failure"
[[ ! -e "$test_tmp/environment.mock" ]] \
    || fail "failed upgrade did not clean the environment snapshot"

reset_upgrade_fakes
execute_runtime_version() {
    printf 'Build Hash: %s\n' "$zero_commit"
}
assert_failure_contains "running Mattermost build hash is" \
    main --expected-commit "$expected_commit"
[[ ! -e "$test_tmp/environment.mock" ]] \
    || fail "runtime mismatch did not clean the environment snapshot"

upgrade_runtime_dir="$test_tmp"
env_snapshot_path="$test_tmp/environment.manual"
: >"$env_snapshot_path"
cleanup_environment_snapshot
[[ ! -e "$test_tmp/environment.manual" ]] \
    || fail "cleanup helper left the expected snapshot behind"
env_snapshot_path="$test_tmp/not-an-environment-snapshot"
: >"$env_snapshot_path"
assert_failure_contains "refusing to clean" cleanup_environment_snapshot
[[ -e "$test_tmp/not-an-environment-snapshot" ]] \
    || fail "cleanup helper removed an unexpected path"

printf 'Production upgrade shell tests passed\n'
