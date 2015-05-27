var dns = require('native-dns');
var server = dns.createServer();
var fs = require('fs');
var cp = require('child_process');
var net = require('net');
var docker = require('docker-remote-api')

var request = docker({
  host: '/var/run/docker.sock'
})

var dnsAmap = [];

function readEtcHosts(){

	//read /etc/hosts and create our map of answers
	var hosts = fs.readFileSync("/etc/hosts").toString().split("\r\n");
	
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


var g_ContainerHosts = [];

function readDockerContainers(){
	
	var containerhosts = "";

	request.get('/containers/json', {json:true}, function(err, containers) {
		  if (err) throw err;
		  
		  for (var i=0;i<containers.length;i++)	
			{
				request.get('/containers/' + containers[i].Id +  '/json', {json:true}, function(err, container) {
					if (err) throw err;
				  
					var hn = container.Config.Hostname + "." + container.Config.Domainname;
					if (container.Config.Domainname === "") 
					   hn = container.Config.Hostname;
				  		 
					dnsAmap[hn] = 
				    		 dns.A({
						    name: hn,
					    	    address: container.NetworkSettings.IPAddress,
						    ttl: 60
						 });

					g_ContainerHosts[hn] =  container.NetworkSettings.IPAddress;

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
						dnsAmap[otherNames[j]] =
                                                 dns.A({
                                                    name: otherNames[j],
                                                    address: container.NetworkSettings.IPAddress,
                                                    ttl: 60
                                                 });

						g_ContainerHosts[otherNames[j]] =  container.NetworkSettings.IPAddress;
					}
				});
			}
		  
	});


}

function updateEtcHosts()
{

	containerhosts = "";

	for (var name in g_ContainerHosts) {
 		 if (g_ContainerHosts.hasOwnProperty(name)) {
			containerhosts += g_ContainerHosts[name] + "\t" + name + "\r\n";
 	 	 }
	}

	if (containerhosts === "") return;

	var hosts = fs.readFileSync("/etc/hosts").toString();
	var hostsbefore = hosts;

        hosts = hosts.replace(/#BEGIN nodednsmanaged[\s\S]*#END nodednsmanaged\r\n/, "");
	var containerPart =  "#BEGIN nodednsmanaged\r\n" + containerhosts + "#END nodednsmanaged\r\n";

	//comment out duplicates that are in g_ContainerHosts.
	for (var name in g_ContainerHosts) {
                 if (g_ContainerHosts.hasOwnProperty(name)) {
			var r = hosts.match(new RegExp("\\n.+" + name));
			if (r != null) {
				if (r[0].indexOf("\n#") !== 0){
					hosts = hosts.replace(r[0], "\n#NODEDNS managed " + r[0].substring(1));
					//console.log(r[0].substring(1));
				}
			}
                 }
        }

	hosts = containerPart + hosts;

	if (hosts !== hostsbefore)
		fs.writeFileSync("/etc/hosts", hosts);

}



server.on('request', function (request, response) {
  
  if (dnsAmap.hasOwnProperty(request.question[0].name))
  {
	  console.log("request for " + request.question[0].name + "(" +  dnsAmap[request.question[0].name].address + ")");
	  response.answer.push(dnsAmap[request.question[0].name]);	  
  }
  else
  {
	  console.log("request for " + request.question[0].name + " not found");
  }
  response.send();
  
});

server.on('error', function (err, buff, req, res) {
  console.log(err.stack);
});

process.on('SIGINT', function() {
    console.log("End");

	var hosts = fs.readFileSync("/etc/hosts").toString();

	if (hosts.indexOf("#BEGIN nodednsmanaged") > -1)
	{	
		hosts = hosts.replace(/#BEGIN nodednsmanaged[\s\S]*#END nodednsmanaged\r\n/, "");
		hosts = hosts.replace(/#NODEDNS managed /g,"");

		fs.writeFileSync("/etc/hosts", hosts);
	}

    	process.exit();
});

readEtcHosts();

setInterval(readDockerContainers, 1000);

updateEtcHosts(); //for unclean shutdown
setInterval(updateEtcHosts, 2000);

server.serve(53);
