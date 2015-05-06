Docker DNS: Quick and Dirty DNS for use with docker containers

**Features:**

  Reads your /etc/hosts and export it to DNS table

  Reads your docker containers and expose the hostname associated with it, and also changes your /etc/hosts with it. (Only for the period that is running)

  Use OTHERHOSTNAMES enviroment variable to add other hostnames to that container.

  Answers only IPV4 requests.

**Install**

```
npm install docker-remote-api
npm install native-dns
git clone https://github.com/Marcelovk/nodedockdns.git
```

**Usage:**

```
nodejs nodedns.js
```

Start your docker containers with --dns pointing to your docker0 interface

from your docker machine ping the hostname of the container to see if is working

**Example script**

```
#!/bin/bash
dockerDNS=$(ifconfig docker0 2>/dev/null|awk '/inet addr:/ {print $2}'|sed 's/addr://')
sudo docker run $dbg --dns=$dockerDNS \
--hostname=my.hostname \
--name=dockername \
-e OTHERNAMES=othername1.host.com,othername2.host.com
```
