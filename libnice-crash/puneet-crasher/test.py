# Following is the snippet of my approach using which i can crash
# Kurento Media server multiple times.
# Please use kurento-tutorial-java/kurento-group-call as application

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
#from selenium.webdriver.support.ui import WebDriverWait
#from selenium.webdriver.support import expected_conditions as EC
import time
import string
import random
import sys

def id_generator(size=6,chars=string.ascii_uppercase+string.digits):
    return ''.join(random.choice(chars) for _ in range (size))

chrome_options = Options()
# chrome_options.add_argument("--use-file-for-fake-video-capture=/home/truring12/Johnny_1280x720_60.y4m")
chrome_options.add_argument("--use-fake-device-for-media-stream")
chrome_options.add_argument("--use-fake-ui-for-media-stream")
chrome_options.add_argument("--disable-web-security")
chrome_options.add_argument("--allow-insecure-localhost")
chrome_options.add_argument("--reduce-security-for-testing")
chrome_options.add_argument("--new-tab")
driver = webdriver.Chrome(chrome_options=chrome_options)

usernameStr = id_generator()
roomnameStr = 'a'

#driver.get("https://localhost:8443")
driver.get("https://18.219.0.186:8443")

username = driver.find_element_by_id('name')
username.send_keys(usernameStr)
roomname = driver.find_element_by_id('roomName')
roomname.send_keys(roomnameStr)
time.sleep(1)  # Account for system slowdown with lots of instances

driver.find_element_by_xpath("//*[@id='join']/form/p[3]/input").submit()
# print driver.page_source.encode('utf-8')
time.sleep(30)
button = driver.find_element_by_id('button-leave')
button.click()
time.sleep(1)
driver.quit()
