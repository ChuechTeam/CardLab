import {Container, Graphics, Point, Rectangle} from "pixi.js";
import {GameScene} from "src/duel/game/GameScene.ts";
import {Card} from "src/duel/game/Card.ts";

export class EntitySelectOverlay extends Container {
    // This one has to be in world space in order to get proper masking.
    background: Graphics
    mask: Graphics
    active = false
    entities: [number, Container][] = []
    
    constructor(public scene: GameScene) {
        super();
        
        this.background = new Graphics()
            .rect(-10000, -10000, 20000, 20000)
            .fill({ color: 0x000000 });
        this.background.alpha = 0.35;
        this.addChild(this.background)
        
        this.mask = new Graphics();
        (this.mask as any).inverseMask = true; // see hacks.ts for implementation
        this.addChild(this.mask)
        
        this.background.mask = this.mask;
        
        this.zIndex = 5000;
        this.eventMode = "none";
        this.visible = false;
    }
    
    // right now card handling is very bad but it sorta works
    show(entities: number[]) {
        this.hide()
        
        this.visible = true;
        this.active = true;
        
        this.mask.clear()
           //.rect(-10000, -10000, 20000, 20000)
           //.fill({ color: 0xffffff });
        
        // that is a cursed af hack
        
        
        this.entities.length = 0;
        for (const entityId of entities) {
            const entity = this.scene.findEntity(entityId);
            if (entity !== undefined) {
                this.entities.push([entityId, entity])
                
                const rect = this.findEntityVisibleRect(entity);
                this.mask.roundRect(rect.x, rect.y, rect.width, rect.height, 6)
                    .fill({ color: 0xffffff });
                
                if (entity instanceof Card) {
                    entity.updateTint(true)
                }
            }
        }
    }
    
    findEntityVisibleRect(ent: Container): Rectangle {
        let rect: Rectangle
        if (ent instanceof Card) {
            rect = ent.findVisibleRect()
        } else {
            const bounds = ent.getBounds();
            const v = this.scene.viewport;
            const coords = v.toWorld(bounds);
            rect = new Rectangle(coords.x, coords.y, 
                bounds.width/v.scale.x, 
                bounds.height/v.scale.y);
            rect.pad(7, 7);
        }
        
        return rect;
    }

    findSelectedEntity(pos: Point): [number, Container] | null {
        const worldPos = this.scene.viewport.toGlobal(pos);
        for (const [id, entity] of this.entities) {
            const bounds = entity.getBounds();
            if (bounds.containsPoint(worldPos.x, worldPos.y)) {
                if (entity instanceof Card) {
                    const hider = entity.findHider()
                    if (hider !== null && hider.getBounds().containsPoint(worldPos.x, worldPos.y)) {
                        continue
                    }
                }
                return [id, entity]
            }
        }

        return null
    }
    
    hide() {
        this.visible = false;
        this.active = false;
        for (const [id, cont] of this.entities) {
            if (cont instanceof Card) {
                cont.updateTint()
            }
        }
    }
}