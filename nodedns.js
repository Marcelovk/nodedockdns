"use strict";
let dns = require('native-dns');
let server = dns.createServer();
let fs = require('fs');
let Docker = require('dockerode');

let docker = new Docker({
  socketPath: '/var/run/docker.sock'
});

let host_ip = new Map();

function readDockerContainers(){

  docker.listContainers(function (err, containers){
    if (err) throw err;

    containers.forEach(function (containerInfo) {
      addContainerNames(containerInfo.Id);
    });

    updateEtcHosts();
  });

}

server.on('request', function (request, response) {

  if (host_ip.has(request.question[0].name)) {
    console.log(`${request.question[0].name} -> ${host_ip.get(request.question[0].name)}`);
    response.answer.push(dns.A({
        name: request.question[0].name,
        address: host_ip.get[request.question[0].name],
        ttl: 1 //containers can be very short lived
    }));
  } else {
    console.log("[" + request.address.address + "]" + " request for " + request.question[0].name + " not found");
  }

  response.send();

});

server.on('error', function (err, buff, req, res) {
  console.log(err.stack);
});

process.on('SIGINT', function() {
  console.log("End");

  process.exit();
});

function removeContainerNames(containerId) {
  docker.getContainer(containerId).inspect(function (err, container) {
    if (container == null) return;
    if (err) throw err;

    var hn = container.Config.Hostname + "." + container.Config.Domainname;
    if (container.Config.Domainname === "")
      hn = container.Config.Hostname;

    console.log("removing " + hn + " " + container.NetworkSettings.IPAddress);

    host_ip.delete(hn);
    updateEtcHosts();
  });
}

function addContainerNames(containerId) {
  docker.getContainer(containerId).inspect(function (err, container) {

    if (container == null) return;

    if (err) throw err;

    var hn = container.Config.Hostname + "." + container.Config.Domainname;
    if (container.Config.Domainname === "")
      hn = container.Config.Hostname;

    console.log("adding " + hn + " " + container.NetworkSettings.IPAddress);

    host_ip.set(hn, container.NetworkSettings.IPAddress);
    updateEtcHosts();
  });
}

function updateEtcHosts() {
  let containerhosts = "";

  host_ip.forEach (function (k,v) {
    containerhosts += `${k}    ${v}\n`
  });

  let hosts = fs.readFileSync("/etc/hosts").toString();
  let hostsbefore = hosts;

  hosts = hosts.replace(/#BEGIN nodednsmanaged[\s\S]*#END nodednsmanaged\r\n/, "");

  if (host_ip.size !== 0) {
    let containerPart =  "#BEGIN nodednsmanaged\r\n" + containerhosts + "#END nodednsmanaged\r\n";
    hosts = containerPart + hosts;
  }

  if (hosts !== hostsbefore) {
    fs.writeFileSync("/etc/hosts", hosts);
  }
}

readDockerContainers();

docker.getEvents(function (err, stream) {
  stream.on('data', function(data) {
    var container = JSON.parse(data.toString());

    switch (container.status) {
      //case "create":
      //case "exec_create":
      case "start":
      case "unpause":
        addContainerNames(container.id);
      break;
      //case "kill":
      //case "stop":
      //case "destroy":
      case "pause":
      case "die":
        removeContainerNames(container.id);
      break;
    }


  });
});

if (process.argv.length < 2) {
  console.log("Usage: node nodedns.js <IP ADDRESS OF DOCKER0 IFACE>");
}

server.serve(53, process.argv[1]);
