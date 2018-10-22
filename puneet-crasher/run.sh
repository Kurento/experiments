#!/usr/bin/env bash

# Usage:
# 1. [In remote] Start KMS:
#     service kurento-media-server restart
#     tail -f /var/log/kurento-media-server/*.log
#     (Watch out for crashes in /var/log/kurento-media-server/errors.log)
# 2. [In remote] Start KMS App:
#     cd puneet-crasher/kurento-group-call
#     mvn clean spring-boot:run -Dkms.url=ws://localhost:8888/kurento
# 3. [In local] Start test:
#     ./run.sh
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
PARTICIPANTS=12
LOOPS=$((PARTICIPANTS * 10))

CHROME_BIN=chromium-browser
DRIVER_BIN=chromedriver



# ---- Script start ----

# Exit on CTRL-C
on_ctrl_c() {
    echo "CTRL-C - STOPPING..."
    pkill -9 --full "python.*test.py"
    pkill -9 --full "$DRIVER_BIN"
    pkill -9 --full "$CHROME_BIN"
    echo "EXIT"
    exit 0
}
trap on_ctrl_c INT

pkill -9 --full "python.*test.py"
pkill -9 --full "$DRIVER_BIN"
pkill -9 --full "$CHROME_BIN"

for _ in $(seq 1 $LOOPS); do
    NUM_JOBS="$(jobs -p | wc --lines)"
    echo "NUM_JOBS: $NUM_JOBS"

    if ((NUM_JOBS >= PARTICIPANTS)); then
        echo "Wait..."
        wait -n
    fi

    NUM_JOBS="$(jobs -p | wc --lines)"  # Update

    if ((NUM_JOBS < PARTICIPANTS)); then
        echo "New participant"
        python ./test.py &
        sleep 1
    fi
done
