var dns = require('native-dns');
var server = dns.createServer();
var fs = require('fs');
var cp = require('child_process');
var net = require('net');
var Docker = require('dockerode');
var child_process = require('child_process');

var docker = new Docker({
  socketPath: '/var/run/docker.sock'
});

var dnsAmap = [];
var manualMap = [];

var g_ContainerHosts = {};
var g_OriginalAnswers = {};

function readDockerContainers(){

	docker.listContainers(function (err, containers){
		if (err) throw err;
		 
		containers.forEach(function (containerInfo)
		{
			addContainerNames(containerInfo.Id);	  
		});
	});

}

server.on('request', function (request, response) {
  
  if (dnsAmap.hasOwnProperty(request.question[0].name))
  {
	console.log("[" + request.address.address + "] requests for " + request.question[0].name + "(" +  dnsAmap[request.question[0].name].address + ")");
	response.answer.push(dnsAmap[request.question[0].name]);	  
  }
  else
  {
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


function removeContainerNames(containerId)
{
        for (var j=0;j<g_ContainerHosts[containerId].hns.length;j++)
	{
		console.log ("removing " + g_ContainerHosts[containerId].hns[j]);
		dnsAmap[g_ContainerHosts[containerId].hns[j]] = g_OriginalAnswers[g_ContainerHosts[containerId].hns[j]];
	}
}

function addContainerNames(containerId)
{
	docker.getContainer(containerId).inspect(function (err, container) {

		if (container == null) return;

		if (err) throw err;
			  
		var hn = container.Config.Hostname + "." + container.Config.Domainname;
		if (container.Config.Domainname === "")
			hn = container.Config.Hostname;
				  	
		console.log("adding " + hn + " " + container.NetworkSettings.IPAddress);
		
		g_OriginalAnswers[hn] = dnsAmap[hn];
		dnsAmap[hn] = 
	    		 dns.A({
			    name: hn,
		    	    address: container.NetworkSettings.IPAddress,
			    ttl: 1 //containers can be very short lived
			 });

		g_ContainerHosts[containerId] = {};
		g_ContainerHosts[containerId].hns = [];
		g_ContainerHosts[containerId].hns.push(hn);

		//check if there are other names for this container
		var cEnv = container.Config.Env;
		var otherNames = [];
		for (var k=0;k<cEnv.length;k++)
		{
			if (cEnv[k].indexOf('OTHERNAMES')==0)
			{
				otherNames = cEnv[k].substr(cEnv[k].indexOf('=')+1).split(',');
			}
		}

		for (var j=0;j<otherNames.length;j++)
		{
			g_OriginalAnswers[otherNames[j]] = dnsAmap[otherNames[j]];
			console.log("adding " + otherNames[j] + " " + container.NetworkSettings.IPAddress);
			dnsAmap[otherNames[j]] =
                        			dns.A({
                                                	name: otherNames[j],
                                                	address: container.NetworkSettings.IPAddress,
                                                	ttl: 1
                                                });

			g_ContainerHosts[containerId].hns.push(otherNames[j]);
		}
	});
		
}

readDockerContainers();

docker.getEvents(function (err, stream)
{
    stream.on('data', function(data)
    {	
	var container = JSON.parse(data.toString());
	
	switch (container.status)
	{
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

if (process.argv.length < 2)
{
	console.log("Usage: node nodedns.js <IP ADDRESS OF DOCKER0 IFACE>");
}


server.serve(53, process.argv[1]);
