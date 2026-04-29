import type { WorkflowTemplate } from "@/types/workflow";

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  // ─── Django Backend Setup ────────────────────────────────────────────────────
  {
    id: "tpl_django_setup",
    name: "Django Backend Setup",
    description: "Full setup of a Django application on a fresh Ubuntu server with Gunicorn + Nginx",
    tags: ["django", "python", "nginx", "gunicorn"],
    variables: [
      { key: "app_name", label: "Application Name", default: "myapp", description: "Directory/service name", required: true },
      { key: "server_ip", label: "Server IP / Domain", default: "", description: "Public IP or domain for Nginx server_name", required: true },
      { key: "wsgi_module", label: "WSGI Module", default: "myapp.wsgi:application", description: "e.g. myproject.wsgi:application", required: true },
      { key: "static_url", label: "Static Files Path", default: "/home/ubuntu/{{app_name}}/staticfiles/", required: false },
    ],
    nodes: [
      {
        id: "n1",
        type: "trigger",
        position: { x: 250, y: 50 },
        data: { label: "Start", description: "Django server setup begins here" },
      },
      {
        id: "n2",
        type: "command",
        position: { x: 250, y: 180 },
        data: { label: "Update System", command: "sudo apt update && sudo apt upgrade -y" },
      },
      {
        id: "n3",
        type: "command",
        position: { x: 250, y: 300 },
        data: { label: "Install Python & Dev Tools", command: "sudo apt install python3-pip python3-dev python3-venv libpq-dev -y" },
      },
      {
        id: "n4",
        type: "command",
        position: { x: 250, y: 420 },
        data: { label: "Create App Directory", command: "mkdir -p /home/ubuntu/{{app_name}}" },
      },
      {
        id: "n5",
        type: "command",
        position: { x: 250, y: 540 },
        data: { label: "Create Virtual Environment", command: "cd /home/ubuntu/{{app_name}} && python3 -m venv venv" },
      },
      {
        id: "n6",
        type: "command",
        position: { x: 250, y: 660 },
        data: { label: "Install Gunicorn & Wheel", command: "cd /home/ubuntu/{{app_name}} && source venv/bin/activate && pip install wheel gunicorn" },
      },
      {
        id: "n7",
        type: "command",
        position: { x: 250, y: 780 },
        data: { label: "Install Requirements", command: "cd /home/ubuntu/{{app_name}} && source venv/bin/activate && pip install -r requirements.txt" },
      },
      {
        id: "n8",
        type: "command",
        position: { x: 250, y: 900 },
        data: { label: "Run Migrations", command: "cd /home/ubuntu/{{app_name}} && source venv/bin/activate && python manage.py makemigrations && python manage.py migrate" },
      },
      {
        id: "n9",
        type: "command",
        position: { x: 250, y: 1020 },
        data: { label: "Collect Static Files", command: "cd /home/ubuntu/{{app_name}} && source venv/bin/activate && python manage.py collectstatic --noinput" },
      },
      {
        id: "n10",
        type: "command",
        position: { x: 250, y: 1140 },
        data: { label: "Set Permissions", command: "sudo chown -R ubuntu:www-data /home/ubuntu/{{app_name}} && sudo chmod -R 755 /home/ubuntu/{{app_name}}" },
      },
      {
        id: "n11",
        type: "file_write",
        position: { x: 250, y: 1260 },
        data: {
          label: "Create Gunicorn Socket",
          remote_path: "/etc/systemd/system/gunicorn.socket",
          sudo: true,
          content: `[Unit]
Description=gunicorn socket

[Socket]
ListenStream=/run/gunicorn.sock

[Install]
WantedBy=sockets.target`,
        },
      },
      {
        id: "n12",
        type: "file_write",
        position: { x: 250, y: 1400 },
        data: {
          label: "Create Gunicorn Service",
          remote_path: "/etc/systemd/system/gunicorn.service",
          sudo: true,
          content: `[Unit]
Description=Gunicorn daemon for {{app_name}}
Requires=gunicorn.socket
After=network.target

[Service]
User=ubuntu
Group=www-data
WorkingDirectory=/home/ubuntu/{{app_name}}
ExecStart=/home/ubuntu/{{app_name}}/venv/bin/gunicorn \\
          --access-logfile - \\
          --workers 3 \\
          --bind unix:/run/gunicorn.sock \\
          {{wsgi_module}}

[Install]
WantedBy=multi-user.target`,
        },
      },
      {
        id: "n13",
        type: "command",
        position: { x: 250, y: 1540 },
        data: { label: "Enable & Start Gunicorn", command: "sudo systemctl daemon-reload && sudo systemctl start gunicorn.socket && sudo systemctl enable gunicorn.socket" },
      },
      {
        id: "n14",
        type: "command",
        position: { x: 250, y: 1660 },
        data: { label: "Install Nginx", command: "sudo apt install nginx -y" },
      },
      {
        id: "n15",
        type: "file_write",
        position: { x: 250, y: 1780 },
        data: {
          label: "Create Nginx Config",
          remote_path: "/etc/nginx/sites-available/{{app_name}}",
          sudo: true,
          content: `server {
    listen 80;
    server_name {{server_ip}};

    location /static/ {
        alias {{static_url}};
    }

    location / {
        include proxy_params;
        proxy_pass http://unix:/run/gunicorn.sock;
    }
}`,
        },
      },
      {
        id: "n16",
        type: "command",
        position: { x: 250, y: 1920 },
        data: { label: "Enable Nginx Site", command: "sudo ln -sf /etc/nginx/sites-available/{{app_name}} /etc/nginx/sites-enabled/ && sudo rm -f /etc/nginx/sites-enabled/default && sudo nginx -t && sudo systemctl restart nginx" },
      },
      {
        id: "n17",
        type: "command",
        position: { x: 250, y: 2040 },
        data: { label: "Configure Firewall", command: "sudo apt install ufw -y && sudo ufw allow 'OpenSSH' && sudo ufw allow 'Nginx Full' && sudo ufw --force enable" },
      },
    ],
    edges: [
      { id: "e1-2", source: "n1", target: "n2" },
      { id: "e2-3", source: "n2", target: "n3" },
      { id: "e3-4", source: "n3", target: "n4" },
      { id: "e4-5", source: "n4", target: "n5" },
      { id: "e5-6", source: "n5", target: "n6" },
      { id: "e6-7", source: "n6", target: "n7" },
      { id: "e7-8", source: "n7", target: "n8" },
      { id: "e8-9", source: "n8", target: "n9" },
      { id: "e9-10", source: "n9", target: "n10" },
      { id: "e10-11", source: "n10", target: "n11" },
      { id: "e11-12", source: "n11", target: "n12" },
      { id: "e12-13", source: "n12", target: "n13" },
      { id: "e13-14", source: "n13", target: "n14" },
      { id: "e14-15", source: "n14", target: "n15" },
      { id: "e15-16", source: "n15", target: "n16" },
      { id: "e16-17", source: "n16", target: "n17" },
    ],
  },

  // ─── Django Update/Re-Deploy ─────────────────────────────────────────────────
  {
    id: "tpl_django_redeploy",
    name: "Django Re-Deploy",
    description: "Stop PM2/Gunicorn, clear old files, extract new build, install deps, restart",
    tags: ["django", "deploy", "update"],
    variables: [
      { key: "app_name", label: "Application Name", default: "myapp", required: true },
      { key: "archive_name", label: "Archive Filename (.tar.gz)", default: "app.tar.gz", required: true },
    ],
    nodes: [
      { id: "n1", type: "trigger", position: { x: 250, y: 50 }, data: { label: "Start Re-Deploy" } },
      { id: "n2", type: "command", position: { x: 250, y: 180 }, data: { label: "Stop Gunicorn", command: "sudo systemctl stop gunicorn.socket gunicorn.service" } },
      { id: "n3", type: "command", position: { x: 250, y: 300 }, data: { label: "Clear App Files", command: "rm -rf /home/ubuntu/{{app_name}}/{*,.*} 2>/dev/null || true" } },
      { id: "n4", type: "command", position: { x: 250, y: 420 }, data: { label: "Extract Archive", command: "cd /home/ubuntu/{{app_name}} && tar -xzvf {{archive_name}}" } },
      { id: "n5", type: "command", position: { x: 250, y: 540 }, data: { label: "Delete Archive", command: "rm -f /home/ubuntu/{{app_name}}/{{archive_name}}" } },
      { id: "n6", type: "command", position: { x: 250, y: 660 }, data: { label: "Install Dependencies", command: "cd /home/ubuntu/{{app_name}} && source venv/bin/activate && pip install -r requirements.txt" } },
      { id: "n7", type: "command", position: { x: 250, y: 780 }, data: { label: "Run Migrations", command: "cd /home/ubuntu/{{app_name}} && source venv/bin/activate && python manage.py migrate" } },
      { id: "n8", type: "command", position: { x: 250, y: 900 }, data: { label: "Collect Static", command: "cd /home/ubuntu/{{app_name}} && source venv/bin/activate && python manage.py collectstatic --noinput" } },
      { id: "n9", type: "command", position: { x: 250, y: 1020 }, data: { label: "Start Gunicorn", command: "sudo systemctl start gunicorn.socket && sudo systemctl restart nginx" } },
    ],
    edges: [
      { id: "e1-2", source: "n1", target: "n2" },
      { id: "e2-3", source: "n2", target: "n3" },
      { id: "e3-4", source: "n3", target: "n4" },
      { id: "e4-5", source: "n4", target: "n5" },
      { id: "e5-6", source: "n5", target: "n6" },
      { id: "e6-7", source: "n6", target: "n7" },
      { id: "e7-8", source: "n7", target: "n8" },
      { id: "e8-9", source: "n8", target: "n9" },
    ],
  },

  // ─── NextJS Setup ────────────────────────────────────────────────────────────
  {
    id: "tpl_nextjs_setup",
    name: "Next.js App Setup",
    description: "Full setup of a Next.js application on a fresh Ubuntu server with PM2 + Nginx",
    tags: ["nextjs", "nodejs", "nginx", "pm2"],
    variables: [
      { key: "app_name", label: "Application Name", default: "nextapp", required: true },
      { key: "server_ip", label: "Server IP / Domain", default: "", description: "Public IP or domain for Nginx server_name", required: true },
      { key: "pm2_name", label: "PM2 Process Name", default: "nextapp", required: true },
    ],
    nodes: [
      { id: "n1", type: "trigger", position: { x: 250, y: 50 }, data: { label: "Start", description: "Next.js server setup begins here" } },
      { id: "n2", type: "command", position: { x: 250, y: 180 }, data: { label: "Update System", command: "sudo apt update && sudo apt upgrade -y" } },
      { id: "n3", type: "command", position: { x: 250, y: 300 }, data: { label: "Install Nginx", command: "sudo apt install nginx -y && sudo systemctl start nginx && sudo systemctl enable nginx" } },
      { id: "n4", type: "command", position: { x: 250, y: 420 }, data: { label: "Install Node.js 20.x", command: "sudo apt install curl -y && curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs" } },
      { id: "n5", type: "command", position: { x: 250, y: 540 }, data: { label: "Install PM2", command: "sudo npm install pm2@latest -g" } },
      { id: "n6", type: "command", position: { x: 250, y: 660 }, data: { label: "Install Yarn", command: "curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add - && echo 'deb https://dl.yarnpkg.com/debian/ stable main' | sudo tee /etc/apt/sources.list.d/yarn.list && sudo apt update && sudo apt install yarn -y" } },
      { id: "n7", type: "command", position: { x: 250, y: 780 }, data: { label: "Create App Directory", command: "sudo mkdir -p /home/ubuntu/{{app_name}} && sudo chown -R ubuntu:ubuntu /home/ubuntu/{{app_name}}" } },
      {
        id: "n8", type: "note", position: { x: 600, y: 780 },
        data: { label: "Transfer Files", text: "Upload your built app archive (.tar.gz) to /home/ubuntu/{{app_name}} using WinSCP or SCP before continuing." },
      },
      { id: "n9", type: "command", position: { x: 250, y: 900 }, data: { label: "Install Dependencies", command: "cd /home/ubuntu/{{app_name}} && yarn install" } },
      { id: "n10", type: "command", position: { x: 250, y: 1020 }, data: { label: "Start App with PM2", command: "cd /home/ubuntu/{{app_name}} && pm2 start npm --name {{pm2_name}} -- start" } },
      { id: "n11", type: "command", position: { x: 250, y: 1140 }, data: { label: "PM2 Autostart", command: "pm2 startup systemd -u ubuntu --hp /home/ubuntu && pm2 save" } },
      {
        id: "n12", type: "file_write", position: { x: 250, y: 1260 },
        data: {
          label: "Create Nginx Config",
          remote_path: "/etc/nginx/sites-available/{{app_name}}",
          sudo: true,
          content: `server {
    listen 80;
    server_name {{server_ip}};

    location /_next/static {
        alias /home/ubuntu/{{app_name}}/.next/static;
        expires 30d;
        access_log off;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}`,
        },
      },
      { id: "n13", type: "command", position: { x: 250, y: 1400 }, data: { label: "Enable Nginx Site", command: "sudo ln -sf /etc/nginx/sites-available/{{app_name}} /etc/nginx/sites-enabled/ && sudo rm -f /etc/nginx/sites-enabled/default && sudo nginx -t && sudo systemctl restart nginx" } },
      { id: "n14", type: "command", position: { x: 250, y: 1520 }, data: { label: "Configure Firewall", command: "sudo ufw allow 'Nginx HTTP' && sudo ufw allow 'OpenSSH' && sudo ufw --force enable" } },
      { id: "n15", type: "command", position: { x: 250, y: 1640 }, data: { label: "Set Permissions", command: "sudo chmod +x /home/ubuntu && sudo chmod +x /home/ubuntu/{{app_name}} && sudo chmod -R 755 /home/ubuntu/{{app_name}}/.next" } },
    ],
    edges: [
      { id: "e1-2", source: "n1", target: "n2" },
      { id: "e2-3", source: "n2", target: "n3" },
      { id: "e3-4", source: "n3", target: "n4" },
      { id: "e4-5", source: "n4", target: "n5" },
      { id: "e5-6", source: "n5", target: "n6" },
      { id: "e6-7", source: "n6", target: "n7" },
      { id: "e7-9", source: "n7", target: "n9" },
      { id: "e9-10", source: "n9", target: "n10" },
      { id: "e10-11", source: "n10", target: "n11" },
      { id: "e11-12", source: "n11", target: "n12" },
      { id: "e12-13", source: "n12", target: "n13" },
      { id: "e13-14", source: "n13", target: "n14" },
      { id: "e14-15", source: "n14", target: "n15" },
    ],
  },

  // ─── NextJS Re-Deploy ────────────────────────────────────────────────────────
  {
    id: "tpl_nextjs_redeploy",
    name: "Next.js Re-Deploy",
    description: "Stop PM2, clear files, upload new build, install deps, restart",
    tags: ["nextjs", "deploy", "update"],
    variables: [
      { key: "app_name", label: "Application Name", default: "nextapp", required: true },
      { key: "pm2_name", label: "PM2 Process Name", default: "nextapp", required: true },
      { key: "archive_name", label: "Archive Filename", default: "app.tar.gz", required: true },
    ],
    nodes: [
      { id: "n1", type: "trigger", position: { x: 250, y: 50 }, data: { label: "Start Re-Deploy" } },
      { id: "n2", type: "command", position: { x: 250, y: 180 }, data: { label: "Stop PM2", command: "pm2 stop {{pm2_name}}" } },
      { id: "n3", type: "command", position: { x: 250, y: 300 }, data: { label: "Clear App Files", command: "rm -rf /home/ubuntu/{{app_name}}/{*,.*} 2>/dev/null || true" } },
      { id: "n4", type: "command", position: { x: 250, y: 420 }, data: { label: "Extract Archive", command: "cd /home/ubuntu/{{app_name}} && tar -xzvf {{archive_name}}" } },
      { id: "n5", type: "command", position: { x: 250, y: 540 }, data: { label: "Delete Archive", command: "rm -f /home/ubuntu/{{app_name}}/{{archive_name}}" } },
      { id: "n6", type: "command", position: { x: 250, y: 660 }, data: { label: "Install Dependencies", command: "cd /home/ubuntu/{{app_name}} && yarn install" } },
      { id: "n7", type: "command", position: { x: 250, y: 780 }, data: { label: "Start PM2", command: "pm2 start {{pm2_name}} && sudo systemctl restart nginx" } },
    ],
    edges: [
      { id: "e1-2", source: "n1", target: "n2" },
      { id: "e2-3", source: "n2", target: "n3" },
      { id: "e3-4", source: "n3", target: "n4" },
      { id: "e4-5", source: "n4", target: "n5" },
      { id: "e5-6", source: "n5", target: "n6" },
      { id: "e6-7", source: "n6", target: "n7" },
    ],
  },
];
