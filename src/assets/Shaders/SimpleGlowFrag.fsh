// Adds pixel color to the actual texture color based on an animated factor

#ifdef GL_ES
precision lowp float;
#endif

varying vec2 v_texCoord;
uniform sampler2D u_texture;
uniform lowp float u_intensityFact;

void main()
{
	// maximum 0.5 times the value of the texture color
	float max_add_fact = 0.65 * u_intensityFact;
    vec4 normalColor = texture2D(u_texture, v_texCoord).rgba;
    vec3 finalColor = normalColor.rgb + (normalColor.rgb * max_add_fact);
    
    gl_FragColor = vec4(finalColor, normalColor.a);
}