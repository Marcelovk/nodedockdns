var dns = require('native-dns');
var server = dns.createServer();
var fs = require('fs');
var cp = require('child_process');
var net = require('net');
var Docker = require('dockerode');
var xml2js = require('xml2js');
var child_process = require('child_process');

var docker = new Docker({
  socketPath: '/var/run/docker.sock'
});

var dnsAmap = [];
var manualMap = [];

var PATH_HOSTS_UOL_BUILD_XML='/home/mkampen/workspace/hosts/build.xml';

function readEtcHosts(path){

	//read /etc/hosts and create our map of answers
	var hosts = fs.readFileSync(path).toString().split("\n");
	
	for (var j=hosts.length-1;j>=0;j--)
	{
		var h = hosts[j];		
		
		if (h.indexOf("#") > -1)
			h = h.substring(0, h.indexOf("#"));
		
		if (h.trim()=='') continue;
				
		parts = h.split(/(\s+)/);		
		
		if (parts.length > 1)
		{	
			for (i=1;i<parts.length;i++)
			{
				if (parts[i].trim().length == 0) continue;
				console.log("read " + parts[0] + " " + parts[i]);
									
				dnsAmap[parts[i]] = dns.A({
				    name: parts[i],
				    address: parts[0],
				    ttl: 600,
				  });				
			}
		}		
	}


}

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


function getEnviroment(environmentName)
{
	if ((environmentName == null) || (environmentName == undefined)) return;

	console.log(child_process.execSync('ant -f ' + PATH_HOSTS_UOL_BUILD_XML + ' ' + environmentName  +  ' -Dlinux_hosts_path=/tmp/nodedns_hosts'));
        readEtcHosts('/tmp/nodedns_hosts');

}

getEnviroment(process.argv[2]);

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

server.serve(53, '172.17.42.1');
