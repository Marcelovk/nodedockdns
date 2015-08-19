Docker DNS: Quick and Dirty DNS for use with docker containers

**Features:**

  Reads your docker containers and expose the hostname associated with it

  Use OTHERHOSTNAMES enviroment variable to add other hostnames to that container.

  Answers only IPV4 requests.

**Install**

```
git clone https://github.com/Marcelovk/nodedockdns.git
npm install
```

**Usage:**

```
nodejs nodedns.js <ip address of docker0 interface>
```

Start your docker containers with --dns pointing to your docker0 interface

From your docker host ping the hostname of the container to see if is working, and from containers ping other
containers.

**Example script**

```
#!/bin/bash
dockerDNS=$(ifconfig docker0 2>/dev/null|awk '/inet addr:/ {print $2}'|sed 's/addr://')
sudo docker run $dbg --dns=$dockerDNS \
--hostname=my.hostname \
--name=dockername \
-e OTHERNAMES=othername1.host.com,othername2.host.com
```
