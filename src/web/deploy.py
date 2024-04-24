import argparse
import subprocess
import os

"""
DEPLOY SCRIPT: Used to do various deployment and production related tasks.
Currently used to run the Vite assets build and compiling base packs.
Could later be used to deploy to a server using ssh. 
"""

proj_dir = os.path.dirname(os.path.realpath(__file__))


def build_vite(publish_dir):
    print("Building Vite bundles...")
    subprocess.call(["npm", "run", "build", "--", "--outDir", os.path.join(publish_dir, "wwwroot")],
                    cwd=os.path.join(proj_dir, "Client", "card-lab"),
                    shell=True)


def compile_packs(publish_dir):
    print("Compiling base game packs...")
    cl_dll = os.path.join(publish_dir, "CardLab.dll")

    if not os.path.exists(cl_dll):
        raise Exception("No CardLab.dll found in publish directory {}".format(publish_dir))

    subprocess.call(["dotnet", cl_dll, "--compile", os.path.join(proj_dir, "Game/BasePacks/Assets")],
                    shell=True)


arp = argparse.ArgumentParser()
arp.add_argument("tasks", choices=["build_vite", "compile_packs"], nargs="+")
arp.add_argument("--publish-dir", dest="publish_dir")
args = arp.parse_args()

for task in args.tasks:
    if task == "compile_packs" and not args.publish_dir:
        raise Exception("--publish_dir is required for compile_packs")
    if task == "build_vite" and not args.publish_dir:
        raise Exception("--publish_dir is required for build_vite")

for task in args.tasks:
    if task == "build_vite":
        build_vite(args.publish_dir)
    if task == "compile_packs":
        compile_packs(args.publish_dir)
