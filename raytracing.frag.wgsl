const SAMPLES: i32 = 1;
const MAXBOUNCES: i32 = 8;

@group(0) @binding(0) var<uniform> resolution : vec2f;
@group(0) @binding(1) var<uniform> cameraPos : vec3f;
@group(0) @binding(2) var<uniform> cameraLookAt : vec3f;
@group(0) @binding(3) var<uniform> iteration : f32;
@group(0) @binding(4) var previousFrame : texture_2d<f32>;
@group(0) @binding(5) var currentFrame : texture_storage_2d<rgba32float, write>;


// ########### Constants ###########

const INFINITY: f32 = bitcast<f32>(0x7F7FFFFFu);
const EPSILON: f32 = 0.0001; // todo better definition
const PI: f32 = 3.1415926535897932384626433832795;

var<private> coordinates : vec2f;

// ########### Structs ###########

struct Ray {
    origin: vec3f,
    direction: vec3f,
};

struct Material {
    color: vec3f,
    reflection: f32,
    refraction: f32,
    texture: bool,
    emissive: bool,
};

struct Sphere {
    center: vec3f,
    radius: f32,
    material: Material,
};

struct Triangle {
	p0: vec3f,
	p1: vec3f,
	p2: vec3f,
    material: Material,
};

struct HitRecord {
    p: vec3f,         // position
    normal: vec3f,
    t: f32,          // distance
    u: f32,
    v: f32,
    frontFace: bool,
    material: Material,
};

// ########### Scene ###########

//                                                R     G         B  Reflect Refract Texture Emissive
const ground:       Material = Material(vec3f(  0.3,  0.3,     0.3),   0.0,  0.0,   true, false);
const glass:        Material = Material(vec3f(  1.0,  1.0,     1.0),   1.0,  1.5,  false, false);
const metal:        Material = Material(vec3f(  1.0,  1.0,     1.0),   1.0,  0.0,  false, false);
const roughtMetal:  Material = Material(vec3f(  1.0,  1.0,     1.0),   0.3,  0.0,  false, false);

const solidIndigo:  Material = Material(vec3f(  0.3,  0.0,     0.5),   0.0,  0.0,  false, false);
const solidGreen:   Material = Material(vec3f(  0.0,  1.0,     0.0),   0.0,  0.0,  false, false);
const solidRed:     Material = Material(vec3f(  1.0,  0.0,     0.0),   0.0,  0.0,  false, false);
const solidBlue:    Material = Material(vec3f(  0.0,  0.0,     1.0),   0.0,  0.0,  false, false);
const solidYellow:  Material = Material(vec3f(  1.0,  1.0,     0.0),   0.0,  0.0,  false, false);
const solidWhite:   Material = Material(vec3f(  1.0,  1.0,     1.0),   0.0,  0.0,  false, false);
const cornellRed:   Material = Material(vec3f(  1.0, 0.01,    0.01),  0.01,  0.0,  false, false);
const cornellGreen: Material = Material(vec3f( 0.01,  1.0,    0.01),  0.01,  0.0,  false, false);
const cornellWhite: Material = Material(vec3f(  0.9,  0.9,     0.9),  0.01,  0.0,  false, false);

const weakLight:    Material = Material(vec3f(  1.0,   1.0,   1.0 ),   0.0,  0.0,  false, true );
const light:        Material = Material(vec3f( 10.0,  10.0,  10.0 ),   0.0,  0.0,  false, true );
const strongLight:  Material = Material(vec3f(100.0, 100.0, 100.0 ),   0.0,  0.0,  false, true );
const glowOrange:   Material = Material(vec3f(  1.7,   0.6,   0.01),   0.0,  0.0,  false, true );

/**/ // switch
const lightsCount = 1; // todo find a way to call .length
const lights = array<Sphere, lightsCount>(
	Sphere(vec3f( 0,.9,0),  0.1, weakLight),
);

const spheresCount = 2; // todo find a way to call .length
const spheres = array<Sphere, spheresCount>(
	Sphere(vec3f( -.4, -.7, 0), .3, glass),
	Sphere(vec3f( .4, -.7, 0), .3, metal),
);

const trianglesCount = 10;
const triangles = array<Triangle, trianglesCount>(
	Triangle(vec3f(-1, 1, 1), vec3f(-1,-1, 1), vec3f(-1, 1,-1), cornellRed),
	Triangle(vec3f(-1,-1, 1), vec3f(-1,-1,-1), vec3f(-1, 1,-1), cornellRed),
	Triangle(vec3f( 1, 1, 1), vec3f( 1, 1,-1), vec3f( 1,-1, 1), cornellGreen),
	Triangle(vec3f( 1,-1, 1), vec3f( 1, 1,-1), vec3f( 1,-1,-1), cornellGreen),
	Triangle(vec3f( 1,-1,-1), vec3f( 1, 1,-1), vec3f(-1, 1,-1), cornellWhite),
	Triangle(vec3f(-1,-1,-1), vec3f( 1,-1,-1), vec3f(-1, 1,-1), cornellWhite),
	Triangle(vec3f(-1,-1, 1), vec3f( 1,-1,-1), vec3f(-1,-1,-1), solidWhite),
	Triangle(vec3f( 1,-1,-1), vec3f(-1,-1, 1), vec3f( 1,-1, 1), solidWhite),
	Triangle(vec3f(-1, 1, 1), vec3f(-1, 1,-1), vec3f( 1, 1,-1), solidWhite),
	Triangle(vec3f( 1, 1,-1), vec3f( 1, 1, 1), vec3f(-1, 1, 1), solidWhite),
);


// ########### Common functions ###########

fn unitVector(v: vec3f) -> vec3f {
    return v / length(v);
}

fn at(ray: Ray, t: f32) -> vec3f {
	return ray.origin + t * ray.direction;
}

fn rand(seed: f32) -> f32 {
    return fract(sin(dot(vec2(seed + 1 / iteration) * coordinates, vec2(12.9898, 78.233))) * 43758.5453);
}

fn randMM(seed: f32, min: f32, max: f32) -> f32 {
    return min + (max - min) * rand(seed);
}

fn rand2MM(seed: f32, min: f32, max: f32) -> vec2f {
    return vec2f( randMM(seed, min, max), randMM(seed * 4793.0, min, max));
}

fn rand3MM(seed: f32, min: f32, max: f32) -> vec3f {
    return vec3f(randMM(seed, min, max), randMM(seed + 4789.0, min, max), randMM(seed + 7919.0, min, max));
}

fn rand2(seed: f32) -> vec2f {
    return rand2MM(seed, 0.0, 1.0);
}

fn rand3(seed: f32) -> vec3f {
    return rand3MM(seed, 0.0, 1.0);
}

fn random_in_unit_sphere(seed: f32) -> vec3f {
	var rand = rand3(seed);
	var ang1 = (rand.x + 1.0) * PI; // [-1..1) -> [0..2*PI)
	var u = rand.y; // [-1..1), cos and acos(2v-1) cancel each other out, so we arrive at [-1..1)
	var u2 = u * u;
	var sqrt1MinusU2 = sqrt(1.0 - u2);
	var x = sqrt1MinusU2 * cos(ang1);
	var y = sqrt1MinusU2 * sin(ang1);
	var z = u;
	return vec3f(x, y, z);
}

fn random_unit_vector(seed: f32) -> vec3f {
    return normalize(random_in_unit_sphere(seed));
}

fn random_in_hemisphere(normal: vec3f, seed: f32) -> vec3f {
    var in_unit_sphere = random_in_unit_sphere(seed);
    if (dot(in_unit_sphere, normal) > 0.0) {// In the same hemisphere as the normal
        return in_unit_sphere;
    } else {
        return -in_unit_sphere;
    }
}

// ########### Raytracing functions ###########

fn hitSphere(sphere: Sphere, ray: Ray, tMin: f32, tMax: f32, rec: ptr<function, HitRecord>) -> bool { // ? todo why function and not private pointer
    var oc = ray.origin - sphere.center;
    var a = dot(ray.direction, ray.direction);
    var half_b = dot(oc, ray.direction);
    var c = dot(oc, oc) - sphere.radius * sphere.radius;
    var discriminant = half_b * half_b - a * c;
	
	if (discriminant < 0.0){
        return false;
    }

	var sqrtd = sqrt(discriminant);
	var root = (-half_b - sqrtd) / a;
    if (root < tMin || tMax < root) {
        root = (-half_b + sqrtd) / a;
        if (root < tMin || tMax < root){
            return false;
        }
    }

	(*rec).t = root;
	(*rec).p = at(ray, (*rec).t);

	var outward_normal = ((*rec).p - sphere.center) / sphere.radius;
	(*rec).frontFace = dot(ray.direction, outward_normal) < 0.;
	(*rec).normal = select(-outward_normal, outward_normal, (*rec).frontFace);
	(*rec).material = sphere.material;

	var theta = acos(-(*rec).p.y);
	var phi = atan2(-(*rec).p.z, (*rec).p.x) + PI;
	(*rec).u = phi / (2.0 * PI);
	(*rec).v = theta / PI;

	return true;
}

fn hitTriangle(triangle: Triangle, ray: Ray, tMin: f32, tMax: f32, rec: ptr<function, HitRecord>) -> bool {
	let e0 = triangle.p1 - triangle.p0;
    let e1 = triangle.p0 - triangle.p2;
    let triangleNormal = cross( e1, e0 );

	let e2 = ( 1.0 / dot( triangleNormal, ray.direction ) ) * ( triangle.p0 - ray.origin );
    let i = cross( ray.direction, e2 );

	var barycentricCoord = vec3f(0);
    barycentricCoord.y = dot( i, e1 );
    barycentricCoord.z = dot( i, e0 );
    barycentricCoord.x = 1.0 - (barycentricCoord.z + barycentricCoord.y);
    let hit = dot( triangleNormal, e2 );

	if(hit > tMax || hit < tMin){
		return false;
	}
	
	if(barycentricCoord.x > 1 || barycentricCoord.x < 0||
		barycentricCoord.y > 1 || barycentricCoord.y < 0|| 
		barycentricCoord.z > 1 || barycentricCoord.z < 0){
		return false;
	}

	(*rec).t = hit;
	(*rec).p = at(ray, (*rec).t);
	(*rec).frontFace = dot(ray.direction, triangleNormal) < 0.;
	(*rec).normal = triangleNormal;
	(*rec).material = triangle.material;
	(*rec).u = 0;
	(*rec).v = 0;

    return true;
}


fn WorldHit(ray: Ray) -> HitRecord{
	var rec = HitRecord(vec3(0.0),vec3(0.0), INFINITY, 0.0, 0.0, false, ground);

	for(var i: i32 = 0; i < spheresCount; i++){
		hitSphere(spheres[i], ray, EPSILON, rec.t, &rec);
    }
	
	for(var i: i32 = 0; i < trianglesCount; i++){
		hitTriangle(triangles[i], ray, EPSILON, rec.t, &rec);
    }
		
	for(var i: i32 = 0; i < lightsCount; i++){
		hitSphere(lights[i], ray, EPSILON, rec.t, &rec);
    }
		
	return rec;	
}

fn directionToLight(light: Sphere, point: vec3f) -> vec3f {
	return normalize(light.center + light.radius * random_in_unit_sphere(point.x) - point);
}

fn LightHit(point: vec3f, normal: vec3f) -> vec3f {
	var lightColor = vec3f(0);
	var rec = HitRecord(vec3(0.0),vec3(0.0), INFINITY, 0.0, 0.0, false, ground);
	for(var i: i32 = 0; i < lightsCount; i++){
		
		var ray = Ray(point, directionToLight(lights[i], point));
		
		if(dot(normal, ray.direction) <= 0.0){
			continue;
        }
		
		rec = WorldHit(ray);
        if(rec.material.emissive){
            lightColor += rec.material.color / pow(rec.t, 3.0);
        }
	}
	return lightColor;	
}

fn rayColor(_ray: Ray) -> vec3f {
    var ray = _ray;
	var rayColor = vec3(1.0);
	var lightAdditive = vec3(0.0);
	var totalDistance = 0.0;

	for(var depth = 0; depth < MAXBOUNCES; depth++){

		var rec = WorldHit(ray);

		var materialColor = rec.material.color;
		if(rec.material.texture && sin(16.0 * rec.p.x) * sin(16.0 * rec.p.z) < -0.015){
			materialColor /= 8.0;
        }

		totalDistance += rec.t;

		if(rec.material.emissive){ // light
			rayColor *= materialColor / pow(totalDistance, 3.0);
			lightAdditive += rayColor;
			break;
		}

		var light = LightHit(rec.p, rec.normal);

		if(rec.material.refraction == 0.0){ // light on solid
			lightAdditive += rayColor * light * materialColor * (1.0 - rec.material.reflection);
		}

		if(rec.t >= INFINITY){ // nothing hitted
			rayColor = vec3f(0, 0, 0);
			break;
		}

		var targetColor: vec3f;
		if(rec.material.refraction > 0.0){ // glass
			var refraction_ratio = select(rec.material.refraction, 1.0 / rec.material.refraction, rec.frontFace);
			var unit_direction = normalize(ray.direction);
			targetColor = refract(unit_direction, rec.normal, refraction_ratio);
		} else{
			// mirror
			var targetReflect = reflect(ray.direction, rec.normal);
			// diffuse
			var targetDiffuse = rec.normal + random_in_hemisphere(rec.normal, rec.t + f32(depth));
			targetColor = mix(targetDiffuse, targetReflect, rec.material.reflection);
		}
		ray = Ray(rec.p, targetColor);

		rayColor *= materialColor;
	}
	return lightAdditive;
}

// ########### Main ###########

@fragment
fn main(
    @location(0) fragPosition: vec4f
) -> @location(0) vec4f {
	coordinates = fragPosition.xy * .05;
    var tmpColor = vec3f(0.0);
	var lookfrom = cameraPos;
	var lookat = cameraLookAt;
	var vup = vec3f(0, 1, 0);
	var vfov = 60.0;
	var aspect_ratio = resolution.x / resolution.y;
	var aperture = 0.1;
	var focus_dist = 10.0;

	var  theta = radians(vfov);
	var  h = tan(theta / 2.);
	var  viewport_height = 2.0 * h;
	var  viewport_width = aspect_ratio * viewport_height;

	var w = normalize(lookfrom - lookat);
	var u = normalize(cross(vup, w));
	var v = cross(w, u);

	var origin = lookfrom;
	var horizontal = focus_dist * viewport_width * u;
	var vertical = focus_dist * viewport_height * v;
	var lower_left_corner = origin - horizontal / 2. - vertical / 2. - focus_dist * w;

	for(var sampleI = 0; sampleI < SAMPLES; sampleI++){
		var randomOffset = rand2(42.4 * f32(sampleI) + 3/iteration) / resolution;
		randomOffset += fragPosition.xy;

		var ray = Ray(cameraPos, lower_left_corner + randomOffset.x * horizontal + randomOffset.y * vertical - cameraPos);
		tmpColor += rayColor(ray);
	}

	var gamma = 2.2;

	var current = pow(tmpColor / f32(SAMPLES), vec3f(1.0 / gamma));
	current = min(max(vec3f(0), current), vec3f(4)); // todo cheaty no fireflies

	var previous = textureLoad(
    	previousFrame,
    	vec2<i32>((vec2(fragPosition.x,1-fragPosition.y)) * resolution.xy),
    	0
  	).xyz;

	current = max(vec3f(0,0,0), current);
	var finalColor = vec4(mix(previous, current, 1/iteration), 1.0);

	textureStore(
		currentFrame,
		vec2<i32>((vec2(fragPosition.x,1-fragPosition.y)) * resolution.xy),
		finalColor		
	);

	//return vec4(vec3(rand(42.4)), 1);
	return finalColor;
}
