https://www.piware.de/2011/01/creating-an-https-server-in-python/

import BaseHTTPServer, SimpleHTTPServer
import ssl
httpd = BaseHTTPServer.HTTPServer(('0.0.0.0', 8000), SimpleHTTPServer.SimpleHTTPRequestHandler)
httpd.socket = ssl.wrap_socket (httpd.socket, certfile='server.pem', server_side=True)
httpd.serve_forever()


http://stackoverflow.com/questions/10175812/how-to-create-a-self-signed-certificate-with-openssl