#!/usr/bin/env bash

# Usage:
# 1. [Remote] Start KMS:
#      service kurento-media-server restart
#      tail -f /var/log/kurento-media-server/*.log
#      (Watch out for crashes in /var/log/kurento-media-server/errors.log)
# 2. [Remote] Start KMS App:
#      cd puneet-crasher/kurento-group-call
#      mvn clean spring-boot:run -Dkms.url=ws://localhost:8888/kurento
# 3. [Local] Write the remote IP address in 'test.py':
#      driver.get("https://<RemoteIpAddr>:8443")
# 4. [Local] Start test:
#      ./run.sh
#
# Dependencies:
# - Chromium browser
# - Chromium WebDriver
# - Python bindings for Selenium
# - pkill (procps)
#
# Dependencies command:
# apt-get install chromium-browser chromium-chromedriver python-selenium procps
#
# Notes:
# Use Google Chrome + Chrome WebDriver at your own leisure if you add the
# appropriate repos from Google.

# ---- Settings ----

PARTICIPANTS=30
LOOPS=$((PARTICIPANTS * 3))

CHROME_BIN=chromium-browser
DRIVER_BIN=chromedriver



# ---- Script start ----

num_jobs() {
    jobs -p | wc --lines
}

kill_all() {
    pkill -9 --full "python.*test.py"
    pkill -9 --full "$DRIVER_BIN"
    pkill -9 --full "$CHROME_BIN"
}

# Exit on CTRL+C
on_ctrl_c() {
    echo "CTRL+C - STOPPING..."
    kill_all
    echo "EXIT"
    exit 0
}
trap on_ctrl_c INT

kill_all

for _ in $(seq 1 $LOOPS); do
    NUM_JOBS="$(num_jobs)"
    echo "NUM_JOBS: $NUM_JOBS"

    if ((NUM_JOBS >= PARTICIPANTS)); then
        echo "Wait for any job ..."
        wait -n  # Blocks here
    fi

    NUM_JOBS="$(num_jobs)"

    if ((NUM_JOBS < PARTICIPANTS)); then
        echo "New participant"
        python ./test.py &  # Background job
        sleep 0.5
    fi
done

echo "Wait for all jobs to finish ..."
while (("$(num_jobs)" > 0)); do
    wait -n  # Blocks here
done

echo "END"
