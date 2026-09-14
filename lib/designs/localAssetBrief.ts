/** Asset instructions derive from the copy and already planned frame; no text-model call. */
export function localAssetBrief(layout:any,slide:any,idea:any) {
 if(!layout.needs_visual)return {slot_id:layout.slot_id,slot_label:layout.slot_id,needs_visual:false,preferred_source:'none',generation_prompt:'',search_queries:[],search_keywords:[],source_reason:'Text-led composition: preserve the reading area instead of adding a competing image.'}
 const text=[slide.headline||slide.title,slide.body||slide.supportingText].filter(Boolean).join('. ')
 // Match the current slide before the campaign topic, which otherwise makes every scene identical.
 const scenes:[RegExp,string[],string][]=[
  [/regist|register|conta|sign.?up/i,['entrepreneur seated at a desk entering account details on a desktop keyboard, monitor viewed from behind','business founder using a smartphone to complete account registration'],'account registration'],
  [/cat[aá]logo|catalog|carregue|upload|produtos/i,['product photographer arranging merchandise beside a camera on a tripod','overhead arrangement of neatly organized products, camera and inventory notebook','shop owner photographing a product with a smartphone'],'product photography'],
  [/pagament|checkout|payment/i,['customer tapping a bank card on a payment terminal held by a merchant','close-up of a complete contactless payment terminal and bank card'],'contactless payment'],
  [/entrega|delivery|courier/i,['courier handing a parcel to a customer at a doorway','delivery worker carrying a stack of parcels beside a delivery van'],'parcel delivery'],
  [/armaz|estoque|stock|fulfil|logistic|warehouse|shipping/i,['warehouse operator scanning a parcel barcode with a handheld scanner','organized parcels on a warehouse conveyor with a barcode scanner','warehouse worker checking shelves with a clipboard'],'warehouse inventory'],
  [/cozinh|chef|cook|food/i,['chef stirring a pan with fresh ingredients beside the stove','chef chopping vegetables on a wooden board'],'chef cooking'],
  [/loja|vend|store|ecommerce|shop/i,['confident shop owner presenting their merchandise with an expressive welcoming gesture','entrepreneur celebrating a new sale while looking at a smartphone','carefully arranged retail products with shopping bags'],'small business retail'],
  [/trabalh|work|computer|digital/i,['professional typing at a desktop workstation in three-quarter view','colleagues discussing a document at a work table'],'office working']
 ]
 const match=scenes.find(([pattern])=>pattern.test(text))||scenes.find(([pattern])=>pattern.test(String(idea.topic||'')))
 const seed=[idea.id,layout.slot_id,text].join('|').split('').reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,0)
 const subject=match?match[1][seed%match[1].length]:String(idea.visualDirection||idea.topic||slide.headline||'real business workspace').slice(0,180)
 const query=match?.[2]||'business workspace'
 return {slot_id:layout.slot_id,slot_label:layout.slot_id,needs_visual:true,subject_description:subject,visual_purpose:text.slice(0,700),generation_prompt:'Create a premium realistic commercial photograph for this exact slide: '+text.slice(0,1200)+'. Brand campaign context (secondary to the slide): '+String(idea.topic||'').slice(0,200)+'. Visible scene: '+subject+'. Show the specific activity clearly with believable tools and materials. Use natural skin and fabric textures, anatomically correct hands, physically plausible objects, restrained studio lighting and an editorial camera viewpoint. The subject must dominate the image, occupying 85–92 percent of the usable frame with minimal empty margins. Keep the entire head and all essential props visible. Match the planned frame aspect ratio. Do not default to a smiling person holding a laptop or sealing a box; only show those actions when explicitly required by this scene. No invented lettering, watermarks, duplicated limbs, floating graphics or collage. '+layout.brief,search_queries:[query,query.split(' ').slice(0,2).join(' ')],search_keywords:query.split(/\s+/),preferred_source:layout.background?'unsplash':'ai_generated',source_reason:'Specific slide action and varied scene, chosen for the planned frame'}
}
