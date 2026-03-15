set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

deploy:
    git push github main
