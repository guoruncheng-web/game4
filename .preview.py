import bpy, os, sys, mathutils
out = sys.argv[sys.argv.index("--")+1]
names = sys.argv[sys.argv.index("--")+2:]
for name in names:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=f"public/neon-strike/models/{name}.glb")
    pts=[]
    for o in bpy.data.objects:
        if o.type=='MESH':
            for c in o.bound_box: pts.append(o.matrix_world @ mathutils.Vector(c))
    lo=[min(v[i] for v in pts) for i in range(3)]; hi=[max(v[i] for v in pts) for i in range(3)]
    ctr=[(lo[i]+hi[i])/2 for i in range(3)]; r=max(hi[i]-lo[i] for i in range(3))
    # 从正前方偏一点看:游戏里道具是迎面飘过来的
    bpy.ops.object.camera_add(location=(ctr[0]+r*0.5, ctr[1]-r*1.7, ctr[2]+r*0.45))
    cam=bpy.context.object
    cam.rotation_euler=(mathutils.Vector(ctr)-cam.location).to_track_quat('-Z','Y').to_euler()
    bpy.context.scene.camera=cam
    bpy.ops.object.light_add(type='SUN', location=(ctr[0]+r, ctr[1]-r, ctr[2]+r*1.5)); bpy.context.object.data.energy=3
    s=bpy.context.scene
    s.render.engine='BLENDER_EEVEE'; s.render.resolution_x=420; s.render.resolution_y=420
    s.world=bpy.data.worlds.new("w"); s.world.use_nodes=True
    s.world.node_tree.nodes["Background"].inputs[0].default_value=(0.02,0.015,0.06,1)
    s.render.filepath=os.path.join(out, f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print("PREVIEW", s.render.filepath)
