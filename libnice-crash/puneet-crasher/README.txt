Instrucciones:

Copiar en una máquina remota donde ejecutaremos KMS
(yo he probado tanto en localhost como en una máquina AWS)

- En la máquina remota:
  - Instalar KMS
    (yo he probado nightly, 6.8.0, y 6.7.2)
  - Lanzar app:
    cd puneet-crasher/kurento-group-call/
    mvn clean spring-boot:run -Dkms.url=ws://localhost:8888/kurento

- En local:
  - Instalar dependencias:
    apt-get install chromium-browser chromium-chromedriver python-selenium procps
  - Escribir en 'test.py' la dirección IP remota:
    driver.get("https://<RemoteIpAddr>:8443")
  - Lanzar test:
    cd puneet-crasher/
    ./run.sh

El test original fue publicado por Puneet en el issue de Github:
https://github.com/Kurento/bugtracker/issues/247#issuecomment-423536174
