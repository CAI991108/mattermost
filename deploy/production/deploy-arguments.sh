#!/usr/bin/env bash

parse_deploy_arguments() {
    resume_superseded_deploy=false
    expected_deploy_commit=

    while (( $# > 0 )); do
        case "$1" in
            --resume-superseded-deploy)
                [[ "$resume_superseded_deploy" == false ]] \
                    || die "duplicate deployment argument: $1"
                resume_superseded_deploy=true
                shift
                ;;
            --expected-commit)
                [[ -z "$expected_deploy_commit" ]] \
                    || die "duplicate deployment argument: $1"
                (( $# >= 2 )) || die "missing value for --expected-commit"
                [[ "$2" =~ ^[0-9a-f]{40}$ ]] \
                    || die "expected commit must be a full 40-character lowercase Git SHA"
                expected_deploy_commit=$2
                shift 2
                ;;
            *)
                die "unsupported deployment argument: $1"
                ;;
        esac
    done
}

deployment_repo_git() {
    git -c "safe.directory=$REPO_ROOT" -C "$REPO_ROOT" "$@"
}

validate_expected_deploy_commit() {
    local build_hash=$1
    local resolved_commit

    [[ -n "$expected_deploy_commit" ]] || return 0
    resolved_commit=$(deployment_repo_git rev-parse --verify \
        "${expected_deploy_commit}^{commit}" 2>/dev/null) \
        || die "expected commit does not identify a commit in this repository"
    [[ "$resolved_commit" == "$expected_deploy_commit" ]] \
        || die "expected commit did not resolve exactly"
    [[ "$build_hash" == "$expected_deploy_commit" ]] \
        || die "repository HEAD is $build_hash, expected $expected_deploy_commit"
}
