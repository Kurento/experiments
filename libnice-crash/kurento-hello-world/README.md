kurento-hello-world: libnice socket crash
=========================================

Instructions:

1. Install KMS in AWS instance.
2. Deploy this Server App in the same machine.
3. Run KMS:

```
sudo service kurento-media-server start
```

4. Run this Server App:

```
mvn clean spring-boot:run -Dkms.url=ws://localhost:8888/kurento
```

5. In your local machine, open a browser and point it to the Server App's URL: `https://<IpAddress>:8443/`
6. Start the "Hello World" demo by clicking on "Start".
7. Stop the demo by clicking on "Stop". At this point, KMS <= 6.8.1 crashes due to the libnice socket bug.
